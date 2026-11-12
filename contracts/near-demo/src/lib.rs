use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::storage_management::ext_storage_management;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue};

const STORAGE_DEPOSIT: NearToken = NearToken::from_millinear(10);
const YOCTO: NearToken = NearToken::from_yoctonear(1);
const GAS_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_CALLBACK: Gas = Gas::from_tgas(25);
const MIN_AMOUNT: u128 = 10_000; // 0.01 USDC (6 decimals)
const MAX_AMOUNT: u128 = 100_000_000; // 100 USDC (6 decimals)
const MAX_PENDING_PER_CREATOR: u32 = 50;
const DAY_NS: u64 = 86_400_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum InvoiceStatus { Pending, PaymentReceived, Settling, Paid, Cancelled }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Invoice {
    pub creator: AccountId,
    pub amount: U128,
    pub due_date: u64,
    pub status: InvoiceStatus,
    pub payer: Option<AccountId>,
    pub paid_at: Option<u64>,
    pub attempt_id: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    treasury: AccountId,
    usdc_token: AccountId,
    invoices: LookupMap<String, Invoice>,
    creator_pending: LookupMap<AccountId, u32>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(treasury: AccountId, usdc_token: AccountId) -> Self {
        require!(treasury != usdc_token, "Treasury and token must differ");
        Self {
            treasury,
            usdc_token,
            invoices: LookupMap::new(b"demo-invoices"),
            creator_pending: LookupMap::new(b"demo-creator-pending"),
        }
    }

    /// Anyone may sponsor the contract's one-time USDC storage registration.
    /// The caller supplies the token's required storage deposit; no treasury key is needed.
    #[payable]
    pub fn register_usdc_storage(&mut self) -> Promise {
        require!(env::attached_deposit().as_yoctonear() > 0, "Attach the USDC storage deposit");
        ext_storage_management::ext(self.usdc_token.clone())
            .with_attached_deposit(env::attached_deposit())
            .with_static_gas(Gas::from_tgas(20))
            .storage_deposit(Some(env::current_account_id()), Some(true))
    }

    /// Public testnet-only invoice creation. The creator pays a small storage deposit.
    pub fn create_invoice(&mut self, invoice_id: String, amount: U128, due_date: u64) {
        require!(env::attached_deposit() >= STORAGE_DEPOSIT, "Attach at least 0.01 NEAR storage deposit");
        require!(Self::valid_id(&invoice_id), "Invoice ID must be 32 lowercase hex characters");
        require!(self.invoices.get(&invoice_id).is_none(), "Invoice already exists");
        require!(amount.0 >= MIN_AMOUNT && amount.0 <= MAX_AMOUNT, "Amount must be between 0.01 and 100 USDC");
        let now = env::block_timestamp();
        require!(due_date > now && due_date <= now + 365 * DAY_NS, "Due date must be within the next 365 days");
        let creator = env::predecessor_account_id();
        let pending = self.creator_pending.get(&creator).unwrap_or(0);
        require!(pending < MAX_PENDING_PER_CREATOR, "Creator has reached the pending invoice limit");
        self.creator_pending.insert(&creator, &(pending + 1));
        self.invoices.insert(&invoice_id, &Invoice {
            creator, amount, due_date, status: InvoiceStatus::Pending,
            payer: None, paid_at: None, attempt_id: 0,
        });
        env::log_str("Public demo invoice created on NEAR Testnet");
    }

    pub fn cancel_invoice(&mut self, invoice_id: String) {
        let mut invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        require!(env::predecessor_account_id() == invoice.creator, "Only creator can cancel");
        require!(invoice.status == InvoiceStatus::Pending, "Only pending invoices can be cancelled");
        invoice.status = InvoiceStatus::Cancelled;
        self.decrement_pending(&invoice.creator);
        self.invoices.insert(&invoice_id, &invoice);
    }

    pub fn settle_invoice(&mut self, invoice_id: String) -> Promise {
        let mut invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        require!(invoice.status == InvoiceStatus::PaymentReceived, "Payment is not awaiting settlement");
        invoice.status = InvoiceStatus::Settling;
        invoice.attempt_id += 1;
        let attempt = invoice.attempt_id;
        self.invoices.insert(&invoice_id, &invoice);
        ext_ft_core::ext(self.usdc_token.clone())
            .with_attached_deposit(YOCTO)
            .with_static_gas(GAS_TRANSFER)
            .ft_transfer(self.treasury.clone(), invoice.amount, None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_settlement_complete(invoice_id, attempt),
            )
    }

    #[private]
    pub fn on_settlement_complete(&mut self, invoice_id: String, attempt: u64) -> bool {
        let Some(mut invoice) = self.invoices.get(&invoice_id) else { return false };
        if invoice.status != InvoiceStatus::Settling || invoice.attempt_id != attempt { return false; }
        if env::promise_result(0).is_ok() {
            invoice.status = InvoiceStatus::Paid;
            invoice.paid_at = Some(env::block_timestamp());
            self.decrement_pending(&invoice.creator);
            self.invoices.insert(&invoice_id, &invoice);
            true
        } else {
            invoice.status = InvoiceStatus::PaymentReceived;
            self.invoices.insert(&invoice_id, &invoice);
            false
        }
    }

    pub fn get_invoice(&self, invoice_id: String) -> Option<Invoice> {
        self.invoices.get(&invoice_id)
    }

    pub fn get_config(&self) -> (AccountId, AccountId) {
        (self.treasury.clone(), self.usdc_token.clone())
    }

    fn valid_id(id: &str) -> bool {
        id.len() == 32 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }

    fn decrement_pending(&mut self, creator: &AccountId) {
        let count = self.creator_pending.get(creator).unwrap_or(0);
        self.creator_pending.insert(creator, &count.saturating_sub(1));
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdc_token, "Unsupported token");
        let Some(mut invoice) = self.invoices.get(&msg) else {
            return PromiseOrValue::Value(amount);
        };
        if invoice.status != InvoiceStatus::Pending
            || env::block_timestamp() > invoice.due_date
            || amount.0 < invoice.amount.0
        {
            return PromiseOrValue::Value(amount);
        }
        invoice.status = InvoiceStatus::PaymentReceived;
        invoice.payer = Some(sender_id);
        self.invoices.insert(&msg, &invoice);
        PromiseOrValue::Value(U128(amount.0 - invoice.amount.0))
    }
}
