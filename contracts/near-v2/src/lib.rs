use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(25);
const YOCTO: NearToken = NearToken::from_yoctonear(1);

// A stuck cross-contract operation must not be manually reconciled immediately.
// Five minutes gives normal NEAR receipts time to complete.
const RECOVERY_DELAY_NS: u64 = 5 * 60 * 1_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum InvoiceStatus {
    Pending,
    PaymentReceived,
    Settling,
    Refunding,
    Paid,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Invoice {
    /// Required fee in USDC base units. USDC has 6 decimals.
    pub amount: U128,
    /// Unix timestamp in milliseconds.
    pub due_date: u64,
    pub status: InvoiceStatus,
    pub payer: Option<AccountId>,
    /// Timestamp in nanoseconds.
    pub paid_at: Option<u64>,
    /// Incremented for each settlement/refund attempt. Prevents stale callbacks.
    pub attempt_id: u64,
    /// Timestamp in nanoseconds when the current external operation started.
    pub operation_started_at: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub admin: AccountId,
    pub treasury: AccountId,
    pub usdc_token: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    config: Config,
    invoices: LookupMap<String, Invoice>,
}

fn emit(event: &str, data: Value) {
    let payload = json!({
        "standard": "school_fee",
        "version": "1.0.0",
        "event": event,
        "data": [data]
    });
    env::log_str(&format!("EVENT_JSON:{}", payload));
}

fn is_valid_invoice_id(id: &str) -> bool {
    id.len() == 32
        && id
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

#[near]
impl Contract {
    /// Initialize atomically with deployment. Do not deploy first and initialize later.
    #[init]
    pub fn new(admin: AccountId, treasury: AccountId, usdc_token: AccountId) -> Self {
        require!(admin != treasury, "Admin and treasury must be different");
        require!(admin != usdc_token, "Admin and token account must be different");
        require!(treasury != usdc_token, "Treasury and token account must be different");

        Self {
            config: Config {
                admin,
                treasury,
                usdc_token,
            },
            invoices: LookupMap::new(b"i"),
        }
    }

    // -------------------------------------------------------------------------
    // Admin methods
    // -------------------------------------------------------------------------

    pub fn create_invoice(&mut self, invoice_id: String, amount: U128, due_date: u64) {
        self.assert_admin();

        require!(
            is_valid_invoice_id(&invoice_id),
            "Invoice ID must be exactly 32 lowercase hexadecimal characters"
        );
        require!(amount.0 > 0, "Invoice amount must be greater than zero");
        require!(due_date > 0, "Due date must be a Unix timestamp in milliseconds");
        require!(
            !self.invoices.contains_key(&invoice_id),
            "Invoice ID already exists"
        );

        let invoice = Invoice {
            amount,
            due_date,
            status: InvoiceStatus::Pending,
            payer: None,
            paid_at: None,
            attempt_id: 0,
            operation_started_at: None,
        };

        self.invoices.insert(&invoice_id, &invoice);

        emit(
            "invoice_created",
            json!({
                "invoice_id": invoice_id,
                "amount": amount.0.to_string(),
                "due_date": due_date
            }),
        );
    }

    pub fn cancel_invoice(&mut self, invoice_id: String) {
        self.assert_admin();

        let mut invoice = self
            .invoices
            .get(&invoice_id)
            .expect("Invoice does not exist");

        require!(
            invoice.status == InvoiceStatus::Pending,
            "Only Pending invoices can be cancelled"
        );

        invoice.status = InvoiceStatus::Cancelled;
        self.invoices.insert(&invoice_id, &invoice);

        emit("invoice_cancelled", json!({ "invoice_id": invoice_id }));
    }

    /// Transfer admin authority. Only the current admin can call this.
    pub fn transfer_admin(&mut self, new_admin: AccountId) {
        self.assert_admin();
        require!(new_admin != self.config.treasury, "Admin cannot be treasury");
        require!(new_admin != self.config.usdc_token, "Invalid admin account");

        let old_admin = self.config.admin.clone();
        self.config.admin = new_admin.clone();

        emit(
            "admin_transferred",
            json!({
                "previous_admin": old_admin,
                "new_admin": new_admin
            }),
        );
    }

    // -------------------------------------------------------------------------
    // NEP-141 payment reception
    // -------------------------------------------------------------------------

    /// Called by the configured USDC contract through ft_transfer_call.
    ///
    /// IMPORTANT DESIGN:
    /// This method does NOT forward USDC to the treasury. It records the received
    /// fee and returns any overpayment immediately. Treasury settlement happens
    /// in a separate transaction. This prevents a treasury transfer from succeeding
    /// while the NEP-141 resolver subsequently refunds the payer because a chained
    /// receiver callback failed.
    #[payable]
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.config.usdc_token,
            "Only the configured USDC token can call ft_on_transfer"
        );

        let invoice_id = msg.trim().to_string();

        let mut invoice = match self.invoices.get(&invoice_id) {
            Some(inv) if inv.status == InvoiceStatus::Pending => inv,
            _ => return PromiseOrValue::Value(amount),
        };

        // block_timestamp is nanoseconds; due_date is Unix milliseconds.
        let now_ms = env::block_timestamp() / 1_000_000;
        if now_ms > invoice.due_date {
            return PromiseOrValue::Value(amount);
        }

        if amount.0 < invoice.amount.0 {
            return PromiseOrValue::Value(amount);
        }

        // Lock the invoice and record the payer before returning successfully.
        // A concurrent second payment will see PaymentReceived and be refunded.
        invoice.status = InvoiceStatus::PaymentReceived;
        invoice.payer = Some(sender_id.clone());
        invoice.paid_at = None;
        invoice.operation_started_at = None;
        self.invoices.insert(&invoice_id, &invoice);

        let excess = U128(amount.0 - invoice.amount.0);

        emit(
            "payment_received",
            json!({
                "invoice_id": invoice_id,
                "payer": sender_id,
                "amount": invoice.amount.0.to_string(),
                "excess_to_refund": excess.0.to_string()
            }),
        );

        // The NEP-141 resolver refunds this excess to sender_id.
        // The invoice fee remains held by this contract until settlement.
        PromiseOrValue::Value(excess)
    }

    // -------------------------------------------------------------------------
    // Treasury settlement
    // -------------------------------------------------------------------------

    /// Anyone may trigger settlement. Funds can only go to the configured treasury.
    pub fn settle_invoice(&mut self, invoice_id: String) -> Promise {
        let mut invoice = self
            .invoices
            .get(&invoice_id)
            .expect("Invoice does not exist");

        require!(
            invoice.status == InvoiceStatus::PaymentReceived,
            "Invoice is not awaiting settlement"
        );

        invoice.status = InvoiceStatus::Settling;
        invoice.attempt_id = invoice.attempt_id.checked_add(1).expect("Attempt overflow");
        invoice.operation_started_at = Some(env::block_timestamp());

        let attempt_id = invoice.attempt_id;
        let fee = invoice.amount;

        self.invoices.insert(&invoice_id, &invoice);

        emit(
            "settlement_started",
            json!({
                "invoice_id": invoice_id,
                "attempt_id": attempt_id,
                "amount": fee.0.to_string(),
                "treasury": self.config.treasury
            }),
        );

        ext_ft_core::ext(self.config.usdc_token.clone())
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .with_attached_deposit(YOCTO)
            .ft_transfer(
                self.config.treasury.clone(),
                fee,
                Some(format!("School fee payment for invoice {}", invoice_id)),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_settlement_complete(invoice_id, attempt_id),
            )
    }

    #[private]
    pub fn on_settlement_complete(&mut self, invoice_id: String, attempt_id: u64) -> bool {
        let succeeded = matches!(env::promise_result(0), near_sdk::PromiseResult::Successful(_));

        let mut invoice = match self.invoices.get(&invoice_id) {
            Some(inv)
                if inv.status == InvoiceStatus::Settling && inv.attempt_id == attempt_id =>
            {
                inv
            }
            _ => return false,
        };

        invoice.operation_started_at = None;

        if succeeded {
            invoice.status = InvoiceStatus::Paid;
            invoice.paid_at = Some(env::block_timestamp());

            emit(
                "invoice_paid",
                json!({
                    "invoice_id": invoice_id,
                    "payer": invoice.payer,
                    "amount": invoice.amount.0.to_string(),
                    "timestamp": env::block_timestamp(),
                    "attempt_id": attempt_id
                }),
            );
        } else {
            // The USDC fee remains in this contract. It has not been refunded.
            // The admin can initiate a refund, or settlement can be retried.
            invoice.status = InvoiceStatus::PaymentReceived;

            emit(
                "settlement_failed",
                json!({
                    "invoice_id": invoice_id,
                    "attempt_id": attempt_id,
                    "amount": invoice.amount.0.to_string()
                }),
            );
        }

        self.invoices.insert(&invoice_id, &invoice);
        succeeded
    }

    // -------------------------------------------------------------------------
    // Refund after a failed settlement
    // -------------------------------------------------------------------------

    /// Admin can return the held fee to the original payer after settlement failure.
    pub fn refund_payment(&mut self, invoice_id: String) -> Promise {
        self.assert_admin();

        let mut invoice = self
            .invoices
            .get(&invoice_id)
            .expect("Invoice does not exist");

        require!(
            invoice.status == InvoiceStatus::PaymentReceived,
            "Invoice is not awaiting settlement or refund"
        );

        let payer = invoice.payer.clone().expect("Payment has no recorded payer");

        invoice.status = InvoiceStatus::Refunding;
        invoice.attempt_id = invoice.attempt_id.checked_add(1).expect("Attempt overflow");
        invoice.operation_started_at = Some(env::block_timestamp());

        let attempt_id = invoice.attempt_id;
        let amount = invoice.amount;

        self.invoices.insert(&invoice_id, &invoice);

        emit(
            "refund_started",
            json!({
                "invoice_id": invoice_id,
                "payer": payer,
                "amount": amount.0.to_string(),
                "attempt_id": attempt_id
            }),
        );

        ext_ft_core::ext(self.config.usdc_token.clone())
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .with_attached_deposit(YOCTO)
            .ft_transfer(
                payer,
                amount,
                Some(format!("Refund for school fee invoice {}", invoice_id)),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_refund_complete(invoice_id, attempt_id),
            )
    }

    #[private]
    pub fn on_refund_complete(&mut self, invoice_id: String, attempt_id: u64) -> bool {
        let succeeded = matches!(env::promise_result(0), near_sdk::PromiseResult::Successful(_));

        let mut invoice = match self.invoices.get(&invoice_id) {
            Some(inv)
                if inv.status == InvoiceStatus::Refunding && inv.attempt_id == attempt_id =>
            {
                inv
            }
            _ => return false,
        };

        invoice.operation_started_at = None;

        if succeeded {
            // The fee has been returned. Keep the invoice Pending so it can be paid again
            // if its due date has not passed.
            invoice.status = InvoiceStatus::Pending;
            invoice.payer = None;
            invoice.paid_at = None;

            emit(
                "payment_refunded",
                json!({
                    "invoice_id": invoice_id,
                    "amount": invoice.amount.0.to_string(),
                    "attempt_id": attempt_id
                }),
            );
        } else {
            // Funds remain in this contract. A later settlement/refund attempt is possible.
            invoice.status = InvoiceStatus::PaymentReceived;

            emit(
                "refund_failed",
                json!({
                    "invoice_id": invoice_id,
                    "attempt_id": attempt_id,
                    "amount": invoice.amount.0.to_string()
                }),
            );
        }

        self.invoices.insert(&invoice_id, &invoice);
        succeeded
    }

    // -------------------------------------------------------------------------
    // Recovery for a callback that did not execute successfully
    // -------------------------------------------------------------------------

    /// Use ONLY after inspecting NEAR transaction/receipt outcomes off-chain.
    ///
    /// For Settling:
    ///   operation_succeeded=true  -> treasury received the fee; mark Paid.
    ///   operation_succeeded=false -> treasury did not receive it; allow retry/refund.
    ///
    /// For Refunding:
    ///   operation_succeeded=true  -> payer received the refund; mark Pending.
    ///   operation_succeeded=false -> refund did not happen; allow retry.
    ///
    /// This is deliberately admin-only because the contract cannot independently
    /// query the historical outcome of an already executed FT transfer.
    pub fn resolve_stuck_operation(
        &mut self,
        invoice_id: String,
        operation_succeeded: bool,
    ) {
        self.assert_admin();

        let mut invoice = self
            .invoices
            .get(&invoice_id)
            .expect("Invoice does not exist");

        require!(
            invoice.status == InvoiceStatus::Settling
                || invoice.status == InvoiceStatus::Refunding,
            "Invoice has no operation requiring recovery"
        );

        let started_at = invoice
            .operation_started_at
            .expect("Missing operation start time");

        require!(
            env::block_timestamp().saturating_sub(started_at) >= RECOVERY_DELAY_NS,
            "Recovery delay has not elapsed"
        );

        let previous_status = invoice.status.clone();

        // Invalidate any delayed callback from the old attempt.
        invoice.attempt_id = invoice.attempt_id.checked_add(1).expect("Attempt overflow");
        invoice.operation_started_at = None;

        match previous_status {
            InvoiceStatus::Settling => {
                if operation_succeeded {
                    invoice.status = InvoiceStatus::Paid;
                    invoice.paid_at = Some(env::block_timestamp());
                } else {
                    invoice.status = InvoiceStatus::PaymentReceived;
                }
            }
            InvoiceStatus::Refunding => {
                if operation_succeeded {
                    invoice.status = InvoiceStatus::Pending;
                    invoice.payer = None;
                    invoice.paid_at = None;
                } else {
                    invoice.status = InvoiceStatus::PaymentReceived;
                }
            }
            _ => unreachable!(),
        }

        self.invoices.insert(&invoice_id, &invoice);

        emit(
            "stuck_operation_resolved",
            json!({
                "invoice_id": invoice_id,
                "operation_succeeded": operation_succeeded,
                "new_status": invoice.status,
                "attempt_id": invoice.attempt_id
            }),
        );
    }

    // -------------------------------------------------------------------------
    // View methods
    // -------------------------------------------------------------------------

    pub fn get_invoice(&self, invoice_id: String) -> Option<Invoice> {
        self.invoices.get(&invoice_id)
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn is_invoice_payable(&self, invoice_id: String) -> bool {
        match self.invoices.get(&invoice_id) {
            Some(invoice) if invoice.status == InvoiceStatus::Pending => {
                env::block_timestamp() / 1_000_000 <= invoice.due_date
            }
            _ => false,
        }
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    fn assert_admin(&self) {
        require!(
            env::predecessor_account_id() == self.config.admin,
            "Only admin can call this method"
        );
    }
}

#[cfg(test)]
mod tests;
