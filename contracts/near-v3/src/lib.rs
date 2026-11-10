use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::{
    env, ext_contract, near, require,
    json_types::{U128, U64},
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    PromiseResult,
};
use near_sdk::collections::{LookupMap, UnorderedMap, UnorderedSet, Vector};
use near_sdk::borsh::BorshSerialize;

const BPS: u128 = 10_000;
const DEFAULT_FEE_BPS: u16 = 100;
const MAX_FEE_BPS: u16 = 500;
const MAX_INVOICE: u128 = 1_000_000_000; // 1,000 USDC, 6 decimals
const MAX_AT_RISK: u128 = 5_000_000_000; // 5,000 USDC
const MAX_LIFETIME_COLLATERAL: u128 = 1_000_000_000; // 1,000 USDC
const MAX_RECOVERIES: u8 = 2;
const WAIT_NS: u64 = 10 * 60 * 1_000_000_000;
const TREASURY_DELAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
const FT_GAS: Gas = Gas::from_tgas(15);
const CALLBACK_GAS: Gas = Gas::from_tgas(25);
const MIN_CALL_GAS: Gas = Gas::from_tgas(70);
const MIN_FREE_NEAR_RESERVE: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR, testnet floor; gas must be measured before deployment
const MAX_EVIDENCE: usize = 500;
const MAX_NAME: usize = 80;
const MAX_DESCRIPTION: usize = 200;

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Schools,
    Invoices,
    UsedInvoiceIds,
    AdminIndex,
    TreasuryIndex,
    Withdrawals,
    StorageWithdrawals,
    SchoolInvoiceIds,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum InvoiceStatus {
    Pending,
    PaymentReceived,
    Settling,
    Refunding,
    SettlementRecovered,
    RefundRecovered,
    Paid,
    Refunded,
    Cancelled,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SchoolStatus {
    PendingApproval,
    Active,
    Suspended,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OperationType {
    Settle,
    Refund,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct School {
    pub school_id: String,
    pub name: String,
    pub description: String,
    pub admin: AccountId,
    pub treasury: AccountId,
    pub status: SchoolStatus,
    pub treasury_verified: bool,
    pub fee_bps: u16,
    pub storage_balance: u128,
    pub registration_storage_cost: u128,
    pub created_at: u64,
    pub queued_treasury: Option<AccountId>,
    pub treasury_effective_at: Option<u64>,
    pub proposed_admin: Option<AccountId>,
    pub approval_pending: bool,
    pub approval_started_at: Option<u64>,
    pub approval_nonce: u64,
    pub treasury_change_nonce: u64,
    pub reactivation_pending: bool,
    pub reactivation_started_at: Option<u64>,
    pub reactivation_nonce: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Invoice {
    pub invoice_id: String,
    pub school_id: String,
    pub amount: u128,
    pub due_date: u64,
    pub status: InvoiceStatus,
    pub fee_bps: u16,
    pub payer: Option<AccountId>,
    pub treasury_snapshot: Option<AccountId>,
    pub fee_amount: u128,
    pub net_amount: u128,
    pub paid_at: Option<u64>,
    pub attempt_counter: u64,
    pub active_attempt_id: Option<u64>,
    pub operation_type: Option<OperationType>,
    pub operation_recipient: Option<AccountId>,
    pub operation_amount: u128,
    pub operation_started_at: Option<u64>,
    pub operation_from_recovered: bool,
    pub recovery_count: u8,
    pub recovered_at: Option<u64>,
}

#[near(serializers = [json])]
pub struct WithdrawalView {
    pub withdrawal_id: U64,
    pub amount: U128,
    pub recipient: AccountId,
    pub started_at: U64,
    pub active: bool,
}

impl From<Withdrawal> for WithdrawalView {
    fn from(w: Withdrawal) -> Self {
        Self { withdrawal_id: U64(w.withdrawal_id), amount: U128(w.amount), recipient: w.recipient, started_at: U64(w.started_at), active: w.active }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct StorageWithdrawal {
    pub withdrawal_id: u64,
    pub school_id: String,
    pub amount: u128,
    pub started_at: u64,
    pub active: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Withdrawal {
    pub withdrawal_id: u64,
    pub amount: u128,
    pub recipient: AccountId,
    pub started_at: u64,
    pub active: bool,
}

#[near(serializers = [json])]
pub struct SchoolView {
    pub school_id: String,
    pub name: String,
    pub description: String,
    pub admin: AccountId,
    pub treasury: AccountId,
    pub status: SchoolStatus,
    pub treasury_verified: bool,
    pub fee_bps: u16,
    pub storage_balance: U128,
    pub created_at: U64,
    pub queued_treasury: Option<AccountId>,
    pub treasury_effective_at: Option<U64>,
    pub proposed_admin: Option<AccountId>,
    pub approval_pending: bool,
    pub reactivation_pending: bool,
    pub reactivation_started_at: Option<U64>,
}

impl From<School> for SchoolView {
    fn from(s: School) -> Self {
        Self {
            school_id: s.school_id, name: s.name, description: s.description,
            admin: s.admin, treasury: s.treasury, status: s.status,
            treasury_verified: s.treasury_verified, fee_bps: s.fee_bps,
            storage_balance: U128(s.storage_balance), created_at: U64(s.created_at),
            queued_treasury: s.queued_treasury, treasury_effective_at: s.treasury_effective_at.map(U64),
            proposed_admin: s.proposed_admin, approval_pending: s.approval_pending,
            reactivation_pending: s.reactivation_pending,
            reactivation_started_at: s.reactivation_started_at.map(U64),
        }
    }
}

#[near(serializers = [json])]
pub struct InvoiceView {
    pub invoice_id: String,
    pub school_id: String,
    pub amount: U128,
    pub due_date: U64,
    pub status: InvoiceStatus,
    pub fee_bps: u16,
    pub payer: Option<AccountId>,
    pub treasury_snapshot: Option<AccountId>,
    pub fee_amount: U128,
    pub net_amount: U128,
    pub paid_at: Option<U64>,
    pub attempt_counter: u64,
    pub active_attempt_id: Option<u64>,
    pub operation_type: Option<OperationType>,
    pub operation_recipient: Option<AccountId>,
    pub operation_amount: U128,
    pub operation_started_at: Option<U64>,
    pub operation_from_recovered: bool,
    pub recovery_count: u8,
    pub recovered_at: Option<U64>,
}

impl From<Invoice> for InvoiceView {
    fn from(i: Invoice) -> Self {
        Self {
            invoice_id: i.invoice_id, school_id: i.school_id, amount: U128(i.amount),
            due_date: U64(i.due_date), status: i.status, fee_bps: i.fee_bps, payer: i.payer,
            treasury_snapshot: i.treasury_snapshot, fee_amount: U128(i.fee_amount),
            net_amount: U128(i.net_amount), paid_at: i.paid_at.map(U64), attempt_counter: i.attempt_counter,
            active_attempt_id: i.active_attempt_id, operation_type: i.operation_type,
            operation_recipient: i.operation_recipient, operation_amount: U128(i.operation_amount),
            operation_started_at: i.operation_started_at.map(U64), operation_from_recovered: i.operation_from_recovered,
            recovery_count: i.recovery_count, recovered_at: i.recovered_at.map(U64),
        }
    }
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(serializers = [json])]
pub struct Accounting {
    pub held: U128,
    pub settling_gross: U128,
    pub settling_fee: U128,
    pub refunding_gross: U128,
    pub fees_available: U128,
    pub fees_in_flight: U128,
    pub lifetime_collateral: U128,
    pub min_liability: U128,
    pub max_liability: U128,
    pub money_at_risk: U128,
}

#[near(serializers = [json])]
pub struct WithdrawalView {
    pub withdrawal_id: U64,
    pub amount: U128,
    pub recipient: AccountId,
    pub started_at: U64,
    pub active: bool,
}
impl From<Withdrawal> for WithdrawalView {
    fn from(w: Withdrawal) -> Self {
        Self { withdrawal_id: U64(w.withdrawal_id), amount: U128(w.amount), recipient: w.recipient, started_at: U64(w.started_at), active: w.active }
    }
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub usdc_token: AccountId,
    pub platform_treasury: Option<AccountId>,
    pub pending_platform_treasury: Option<AccountId>,
    pub paused: bool,
    pub allow_retry: bool,
    pub default_fee_bps: u16,
    pub max_fee_bps: u16,
    pub max_invoice: U128,
    pub max_at_risk: U128,
    pub max_lifetime_collateral: U128,
}

#[ext_contract(ext_ft)]
trait ExtFt {
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance>;
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_self)]
trait ExtSelf {
    fn on_school_treasury_check(&mut self, school_id: String, admin: AccountId) -> bool;
    fn on_queue_treasury_check(&mut self, school_id: String, new_treasury: AccountId, nonce: u64) -> bool;
    fn on_apply_treasury_check(&mut self, school_id: String, new_treasury: AccountId, nonce: u64) -> bool;
    fn on_reactivate_school_check(&mut self, school_id: String, expected_treasury: AccountId, nonce: u64) -> bool;
    fn on_approval_treasury_check(&mut self, school_id: String, fee_bps: u16, expected_treasury: AccountId, nonce: u64) -> bool;
    fn on_platform_treasury_check(&mut self, account_id: AccountId, nonce: u64) -> bool;
    fn on_transfer_complete(&mut self, invoice_id: String, attempt_id: u64, operation: OperationType) -> bool;
    fn on_fee_withdrawal_complete(&mut self, withdrawal_id: u64) -> bool;
    fn on_storage_withdrawal_complete(&mut self, withdrawal_id: u64) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    proposed_owner: Option<AccountId>,
    usdc_token: AccountId,
    platform_treasury: Option<AccountId>,
    platform_treasury_verified: bool,
    pending_platform_treasury: Option<AccountId>,
    pending_platform_treasury_started_at: Option<u64>,
    pending_platform_treasury_nonce: u64,
    paused: bool,
    allow_retry: bool,
    next_school_id: u64,
    next_withdrawal_id: u64,
    next_storage_withdrawal_id: u64,
    schools: UnorderedMap<String, School>,
    invoices: UnorderedMap<String, Invoice>,
    used_invoice_ids: UnorderedSet<String>,
    admin_index: LookupMap<AccountId, String>,
    treasury_index: LookupMap<AccountId, String>,
    school_invoice_ids: LookupMap<String, Vector<String>>,
    withdrawals: UnorderedMap<u64, Withdrawal>,
    storage_withdrawals: UnorderedMap<u64, StorageWithdrawal>,
    held: u128,                 // H
    settling_gross: u128,       // SI
    settling_fee: u128,         // SF
    refunding_gross: u128,      // RI
    fees_available: u128,       // FA
    fees_in_flight: u128,       // FW
    lifetime_collateral: u128,
    prepaid_storage_total: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, usdc_token: AccountId) -> Self {
        require!(owner != env::current_account_id(), "Owner cannot be the contract account");
        require!(usdc_token != env::current_account_id(), "USDC token cannot be the contract account");
        require!(owner != usdc_token, "Owner and USDC token must be separate accounts");
        Self {
            owner,
            proposed_owner: None,
            usdc_token,
            platform_treasury: None,
            platform_treasury_verified: false,
            pending_platform_treasury: None,
            pending_platform_treasury_started_at: None,
            pending_platform_treasury_nonce: 0,
            paused: false,
            allow_retry: true,
            next_school_id: 0,
            next_withdrawal_id: 0,
            next_storage_withdrawal_id: 0,
            schools: UnorderedMap::new(StorageKey::Schools),
            invoices: UnorderedMap::new(StorageKey::Invoices),
            used_invoice_ids: UnorderedSet::new(StorageKey::UsedInvoiceIds),
            admin_index: LookupMap::new(StorageKey::AdminIndex),
            treasury_index: LookupMap::new(StorageKey::TreasuryIndex),
            school_invoice_ids: LookupMap::new(StorageKey::SchoolInvoiceIds),
            withdrawals: UnorderedMap::new(StorageKey::Withdrawals),
            storage_withdrawals: UnorderedMap::new(StorageKey::StorageWithdrawals),
            held: 0,
            settling_gross: 0,
            settling_fee: 0,
            refunding_gross: 0,
            fees_available: 0,
            fees_in_flight: 0,
            lifetime_collateral: 0,
            prepaid_storage_total: 0,
        }
    }

    // ----- School registration and owner controls -----

    #[payable]
    pub fn register_school(&mut self, name: String, description: String, treasury: AccountId) -> Promise {
        self.ensure_async_resources();
        let admin = env::predecessor_account_id();
        require!(admin != self.owner && admin != env::current_account_id() && admin != self.usdc_token, "Invalid school administrator");
        require!(self.admin_index.get(&admin).is_none(), "Administrator already owns a school");
        require!(self.treasury_index.get(&admin).is_none(), "A school treasury cannot become an administrator");
        require!(self.platform_treasury.as_ref() != Some(&admin), "Platform treasury cannot become a school administrator");
        require!(treasury != admin && treasury != self.owner && treasury != env::current_account_id() && treasury != self.usdc_token, "Treasury must be a separate account");
        require!(self.treasury_index.get(&treasury).is_none(), "Treasury is already assigned to a school");
        require!(self.admin_index.get(&treasury).is_none(), "A school administrator cannot be a treasury");
        require!(self.platform_treasury.as_ref() != Some(&treasury), "Platform treasury cannot be a school treasury");
        require!(!name.trim().is_empty() && name.len() <= MAX_NAME, "Invalid school name");
        require!(description.len() <= MAX_DESCRIPTION, "Description is too long");
        require!(env::attached_deposit().as_yoctonear() > 0, "Prepaid storage deposit required");
        let school_id = format!("{:032x}", self.next_school_id);
        self.next_school_id = self.next_school_id.checked_add(1).expect("School id overflow");
        let mut school = School {
            school_id: school_id.clone(),
            name,
            description,
            admin: admin.clone(),
            treasury: treasury.clone(),
            status: SchoolStatus::PendingApproval,
            treasury_verified: false,
            fee_bps: DEFAULT_FEE_BPS,
            storage_balance: env::attached_deposit().as_yoctonear(),
            registration_storage_cost: 0,
            created_at: env::block_timestamp(),
            queued_treasury: None,
            treasury_effective_at: None,
            proposed_admin: None,
            approval_pending: false,
            approval_started_at: None,
            approval_nonce: 0,
            treasury_change_nonce: 0,
            reactivation_pending: false,
            reactivation_started_at: None,
            reactivation_nonce: 0,
        };
        let before = env::storage_usage();
        self.schools.insert(&school_id, &school);
        self.admin_index.insert(&admin, &school_id);
        let bytes = env::storage_usage().saturating_sub(before) as u128;
        let registration_cost = bytes.checked_mul(env::storage_byte_cost().as_yoctonear()).expect("Registration storage cost overflow");
        let deposit = school.storage_balance;
        require!(deposit >= registration_cost, "School deposit does not cover registration storage");
        school.registration_storage_cost = registration_cost;
        school.storage_balance = deposit - registration_cost;
        self.schools.insert(&school_id, &school);
        self.prepaid_storage_total = self.prepaid_storage_total.checked_add(school.storage_balance).expect("Storage liability overflow");
        ext_ft::ext(self.usdc_token.clone())
            .with_static_gas(FT_GAS)
            .storage_balance_of(treasury)
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_school_treasury_check(school_id, admin))
    }

    pub fn cancel_school_registration(&mut self, school_id: String) {
        self.assert_owner();
        let school = self.schools.get(&school_id).expect("School not found");
        require!(school.status == SchoolStatus::PendingApproval && !school.treasury_verified, "School registration is not pending verification");
        require!(env::block_timestamp() >= school.created_at.saturating_add(WAIT_NS), "School registration cancellation delay has not elapsed");
        self.schools.remove(&school_id);
        self.admin_index.remove(&school.admin);
        self.prepaid_storage_total = self.prepaid_storage_total.checked_sub(school.storage_balance).expect("Storage liability underflow");
        let refund = school.storage_balance.checked_add(school.registration_storage_cost).expect("Registration refund overflow");
        Promise::new(school.admin).transfer(NearToken::from_yoctonear(refund));
        env::log_str(&format!("SCHOOL_REGISTRATION_CANCELLED:{}", school_id));
    }

    #[private]
    pub fn on_school_treasury_check(&mut self, school_id: String, admin: AccountId) -> bool {
        let registered = Self::storage_balance_result();
        if let Some(mut school) = self.schools.get(&school_id) {
            let treasury_available = self.treasury_index.get(&school.treasury).is_none()
                && self.platform_treasury.as_ref() != Some(&school.treasury)
                && self.admin_index.get(&school.treasury).is_none();
            if !registered || !treasury_available || school.admin != admin {
                self.schools.remove(&school_id);
                self.admin_index.remove(&admin);
                self.prepaid_storage_total = self.prepaid_storage_total.checked_sub(school.storage_balance).expect("Storage liability underflow");
                let refund = school.storage_balance.checked_add(school.registration_storage_cost).expect("Registration refund overflow");
                Promise::new(admin).transfer(NearToken::from_yoctonear(refund));
                env::log_str("SCHOOL_REGISTRATION_REJECTED_TREASURY_NOT_AVAILABLE");
                return false;
            }
            school.treasury_verified = true;
            self.treasury_index.insert(&school.treasury, &school_id);
            self.schools.insert(&school_id, &school);
            env::log_str(&format!("SCHOOL_REGISTERED:{}", school_id));
            return true;
        }
        false
    }

    pub fn approve_school(&mut self, school_id: String, fee_bps: u16) -> Promise {
        self.assert_owner();
        self.ensure_async_resources();
        require!(fee_bps <= MAX_FEE_BPS, "Platform fee exceeds 5%");
        let mut school = self.schools.get(&school_id).expect("School not found");
        require!(school.status == SchoolStatus::PendingApproval, "School is not awaiting approval");
        require!(school.treasury_verified, "Treasury has not been verified");
        require!(!school.approval_pending, "School approval is already pending");
        school.approval_pending = true;
        school.approval_started_at = Some(env::block_timestamp());
        school.approval_nonce = school.approval_nonce.checked_add(1).expect("Approval nonce overflow");
        let nonce = school.approval_nonce;
        let treasury = school.treasury.clone();
        self.schools.insert(&school_id, &school);
        ext_ft::ext(self.usdc_token.clone())
            .with_static_gas(FT_GAS)
            .storage_balance_of(treasury.clone())
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_approval_treasury_check(school_id, fee_bps, treasury, nonce))
    }

    #[private]
    pub fn on_approval_treasury_check(&mut self, school_id: String, fee_bps: u16, expected_treasury: AccountId, nonce: u64) -> bool {
        let registered = Self::storage_balance_result();
        if let Some(mut school) = self.schools.get(&school_id) {
            if school.status != SchoolStatus::PendingApproval
                || !school.approval_pending
                || school.approval_nonce != nonce
                || school.treasury != expected_treasury { return false; }
            school.approval_pending = false;
            school.approval_started_at = None;
            if !registered {
                self.schools.insert(&school_id, &school);
                return false;
            }
            school.status = SchoolStatus::Active;
            school.treasury_verified = true;
            school.fee_bps = fee_bps;
            self.schools.insert(&school_id, &school);
            env::log_str(&format!("SCHOOL_ACTIVATED:{}", school_id));
            true
        } else { false }
    }

    pub fn cancel_school_approval(&mut self, school_id: String) {
        self.assert_owner();
        let mut school = self.schools.get(&school_id).expect("School not found");
        require!(school.status == SchoolStatus::PendingApproval && school.approval_pending, "No school approval is pending");
        let started = school.approval_started_at.expect("Approval start time missing");
        require!(env::block_timestamp() >= started.saturating_add(WAIT_NS), "School approval cancellation delay has not elapsed");
        school.approval_pending = false;
        school.approval_started_at = None;
        school.approval_nonce = school.approval_nonce.checked_add(1).expect("Approval nonce overflow");
        self.schools.insert(&school_id, &school);
    }

    pub fn suspend_school(&mut self, school_id: String) {
        self.assert_owner();
        let mut school = self.schools.get(&school_id).expect("School not found");
        require!(school.status == SchoolStatus::Active, "School is not active");
        school.status = SchoolStatus::Suspended;
        self.schools.insert(&school_id, &school);
    }

    pub fn reactivate_school(&mut self, school_id: String) -> Promise {
        self.assert_owner();
        self.ensure_async_resources();
        let mut school = self.schools.get(&school_id).expect("School not found");
        require!(school.status == SchoolStatus::Suspended, "School is not suspended");
        require!(!school.reactivation_pending, "School reactivation is already pending");
        school.reactivation_pending = true;
        school.reactivation_started_at = Some(env::block_timestamp());
        school.reactivation_nonce = school.reactivation_nonce.checked_add(1).expect("Reactivation nonce overflow");
        let nonce = school.reactivation_nonce;
        let treasury = school.treasury.clone();
        self.schools.insert(&school_id, &school);
        ext_ft::ext(self.usdc_token.clone())
            .with_static_gas(FT_GAS)
            .storage_balance_of(treasury)
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_reactivate_school_check(school_id, treasury, nonce))
    }

    #[private]
    pub fn on_reactivate_school_check(&mut self, school_id: String, expected_treasury: AccountId, nonce: u64) -> bool {
        let registered = Self::storage_balance_result();
        if let Some(mut school) = self.schools.get(&school_id) {
            if school.status != SchoolStatus::Suspended || !school.reactivation_pending
                || school.reactivation_nonce != nonce || school.treasury != expected_treasury { return false; }
            school.reactivation_pending = false;
            school.reactivation_started_at = None;
            if !registered {
                self.schools.insert(&school_id, &school);
                return false;
            }
            school.treasury_verified = true;
            school.status = SchoolStatus::Active;
            self.schools.insert(&school_id, &school);
            true
        } else { false }
    }

    pub fn cancel_reactivation(&mut self, school_id: String) {
        self.assert_owner();
        let mut school = self.schools.get(&school_id).expect("School not found");
        require!(school.status == SchoolStatus::Suspended && school.reactivation_pending, "No reactivation is pending");
        let started = school.reactivation_started_at.expect("Reactivation start time missing");
        require!(env::block_timestamp() >= started.saturating_add(WAIT_NS), "Reactivation cancellation delay has not elapsed");
        school.reactivation_pending = false;
        school.reactivation_started_at = None;
        school.reactivation_nonce = school.reactivation_nonce.checked_add(1).expect("Reactivation nonce overflow");
        self.schools.insert(&school_id, &school);
    }

    pub fn set_school_fee(&mut self, school_id: String, fee_bps: u16) {
        self.assert_owner();
        require!(fee_bps <= MAX_FEE_BPS, "Platform fee exceeds 5%");
        let mut school = self.schools.get(&school_id).expect("School not found");
        school.fee_bps = fee_bps;
        self.schools.insert(&school_id, &school);
    }

    pub fn propose_owner(&mut self, new_owner: AccountId) {
        self.assert_owner();
        require!(new_owner != self.owner && new_owner != env::current_account_id() && new_owner != self.usdc_token, "Invalid owner");
        require!(self.admin_index.get(&new_owner).is_none(), "A school administrator cannot become owner");
        require!(self.treasury_index.get(&new_owner).is_none(), "A school treasury cannot become owner");
        require!(self.platform_treasury.as_ref() != Some(&new_owner), "Platform treasury cannot become owner");
        self.proposed_owner = Some(new_owner);
    }

    pub fn accept_owner(&mut self) {
        let caller = env::predecessor_account_id();
        require!(self.proposed_owner.as_ref() == Some(&caller), "Not the proposed owner");
        require!(caller != self.usdc_token, "USDC token cannot become owner");
        require!(self.admin_index.get(&caller).is_none(), "A school administrator cannot become owner");
        require!(self.treasury_index.get(&caller).is_none(), "A school treasury cannot become owner");
        require!(self.platform_treasury.as_ref() != Some(&caller), "Platform treasury cannot become owner");
        self.owner = caller;
        self.proposed_owner = None;
    }

    pub fn propose_admin(&mut self, school_id: String, new_admin: AccountId) {
        let mut school = self.get_admin_school(&school_id);
        require!(school.status == SchoolStatus::Active, "Only an active school can transfer administration");
        require!(new_admin != self.owner && new_admin != env::current_account_id() && new_admin != self.usdc_token, "Invalid school administrator");
        require!(self.treasury_index.get(&new_admin).is_none(), "A treasury account cannot become an administrator");
        require!(self.platform_treasury.as_ref() != Some(&new_admin), "Platform treasury cannot become a school administrator");
        require!(new_admin != school.admin, "Already the school administrator");
        require!(self.admin_index.get(&new_admin).is_none(), "Account already administers a school");
        school.proposed_admin = Some(new_admin);
        self.schools.insert(&school_id, &school);
    }

    pub fn accept_admin(&mut self, school_id: String) {
        let mut school = self.schools.get(&school_id).expect("School not found");
        let caller = env::predecessor_account_id();
        require!(school.status == SchoolStatus::Active, "Only an active school can transfer administration");
        require!(school.queued_treasury.is_none(), "Finish the queued treasury change before transferring administration");
        require!(school.proposed_admin.as_ref() == Some(&caller), "Not the proposed administrator");
        require!(caller != self.owner && caller != self.usdc_token && self.admin_index.get(&caller).is_none(), "Administrator is unavailable");
        require!(self.treasury_index.get(&caller).is_none(), "A treasury account cannot become an administrator");
        require!(self.platform_treasury.as_ref() != Some(&caller), "Platform treasury cannot become a school administrator");
        self.admin_index.remove(&school.admin);
        school.admin = caller.clone();
        school.proposed_admin = None;
        self.admin_index.insert(&caller, &school_id);
        self.schools.insert(&school_id, &school);
    }

    pub fn queue_treasury_change(&mut self, school_id: String, new_treasury: AccountId) -> Promise {
        self.ensure_async_resources();
        let mut school = self.get_admin_school(&school_id);
        require!(school.queued_treasury.is_none(), "A treasury change is already queued");
        require!(new_treasury != school.treasury, "Treasury is unchanged");
        require!(new_treasury != school.admin && new_treasury != self.owner && new_treasury != env::current_account_id() && new_treasury != self.usdc_token, "Treasury must be a separate account");
        require!(self.admin_index.get(&new_treasury).is_none(), "A school administrator cannot be a treasury");
        require!(self.treasury_index.get(&new_treasury).map(|id| id == school_id).unwrap_or(true), "Treasury is already assigned to another school");
        require!(self.platform_treasury.as_ref() != Some(&new_treasury), "Platform treasury cannot be a school treasury");
        school.queued_treasury = Some(new_treasury.clone());
        school.treasury_effective_at = None;
        school.treasury_change_nonce = school.treasury_change_nonce.checked_add(1).expect("Treasury change nonce overflow");
        let nonce = school.treasury_change_nonce;
        self.schools.insert(&school_id, &school);
        ext_ft::ext(self.usdc_token.clone())
            .with_static_gas(FT_GAS)
            .storage_balance_of(new_treasury.clone())
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_queue_treasury_check(school_id, new_treasury, nonce))
    }

    #[private]
    pub fn on_queue_treasury_check(&mut self, school_id: String, new_treasury: AccountId, nonce: u64) -> bool {
        if let Some(mut school) = self.schools.get(&school_id) {
            if school.treasury_change_nonce != nonce || school.queued_treasury.as_ref() != Some(&new_treasury) || school.treasury_effective_at.is_some() {
                return false;
            }
            let available = Self::storage_balance_result()
                && self.treasury_index.get(&new_treasury).is_none()
                && self.platform_treasury.as_ref() != Some(&new_treasury)
                && new_treasury != self.usdc_token
                && self.admin_index.get(&new_treasury).is_none();
            if !available {
                school.queued_treasury = None;
                school.treasury_effective_at = None;
                self.schools.insert(&school_id, &school);
                return false;
            }
            school.treasury_effective_at = Some(env::block_timestamp().saturating_add(TREASURY_DELAY_NS));
            self.schools.insert(&school_id, &school);
            true
        } else { false }
    }

    pub fn cancel_treasury_change(&mut self, school_id: String) {
        let mut school = self.get_admin_school(&school_id);
        require!(school.queued_treasury.is_some(), "No treasury change is queued");
        school.queued_treasury = None;
        school.treasury_effective_at = None;
        school.treasury_change_nonce = school.treasury_change_nonce.checked_add(1).expect("Treasury change nonce overflow");
        self.schools.insert(&school_id, &school);
        env::log_str(&format!("SCHOOL_TREASURY_CHANGE_CANCELLED:{}", school_id));
    }

    pub fn apply_treasury_change(&mut self, school_id: String) -> Promise {
        self.ensure_async_resources();
        let school = self.get_admin_school(&school_id);
        let new_treasury = school.queued_treasury.clone().expect("No treasury change queued");
        let effective = school.treasury_effective_at.expect("No effective time");
        let nonce = school.treasury_change_nonce;
        require!(env::block_timestamp() >= effective, "Treasury delay has not elapsed");
        require!(self.treasury_index.get(&new_treasury).is_none(), "Treasury is already assigned to another school");
        require!(self.admin_index.get(&new_treasury).is_none(), "A school administrator cannot be a treasury");
        require!(self.platform_treasury.as_ref() != Some(&new_treasury), "Platform treasury cannot be a school treasury");
        ext_ft::ext(self.usdc_token.clone())
            .with_static_gas(FT_GAS)
            .storage_balance_of(new_treasury.clone())
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_apply_treasury_check(school_id, new_treasury, nonce))
    }

    #[private]
    pub fn on_apply_treasury_check(&mut self, school_id: String, new_treasury: AccountId, nonce: u64) -> bool {
        if !Self::storage_balance_result() { return false; }
        if let Some(mut school) = self.schools.get(&school_id) {
            if school.treasury_change_nonce != nonce
                || school.queued_treasury.as_ref() != Some(&new_treasury)
                || school.treasury_effective_at.map(|time| env::block_timestamp() >= time) != Some(true)
                || self.treasury_index.get(&new_treasury).is_some()
                || self.platform_treasury.as_ref() == Some(&new_treasury)
                || new_treasury == self.usdc_token
                || self.admin_index.get(&new_treasury).is_some() { return false; }
            self.treasury_index.remove(&school.treasury);
            self.treasury_index.insert(&new_treasury, &school_id);
            school.treasury = new_treasury;
            school.treasury_verified = true;
            school.queued_treasury = None;
            school.treasury_effective_at = None;
            self.schools.insert(&school_id, &school);
            true
        } else { false }
    }

    // ----- Prepaid school storage -----

    #[payable]
    pub fn deposit_storage(&mut self, school_id: String) {
        let mut school = self.get_admin_school(&school_id);
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach a storage deposit");
        school.storage_balance = school.storage_balance.checked_add(amount).expect("Storage balance overflow");
        self.prepaid_storage_total = self.prepaid_storage_total.checked_add(amount).expect("Storage liability overflow");
        self.schools.insert(&school_id, &school);
    }

    pub fn withdraw_storage(&mut self, school_id: String, amount: U128) -> Promise {
        self.ensure_async_resources();
        let mut school = self.get_admin_school(&school_id);
        require!(school.status != SchoolStatus::PendingApproval, "Storage cannot be withdrawn before school activation");
        require!(amount.0 > 0 && amount.0 <= school.storage_balance, "Insufficient prepaid storage");
        let id = self.next_storage_withdrawal_id;
        self.next_storage_withdrawal_id = self.next_storage_withdrawal_id.checked_add(1).expect("Storage withdrawal id overflow");
        school.storage_balance -= amount.0;
        self.prepaid_storage_total = self.prepaid_storage_total.checked_sub(amount.0).expect("Storage liability underflow");
        let admin = school.admin.clone();
        self.schools.insert(&school_id, &school);
        self.storage_withdrawals.insert(&id, &StorageWithdrawal {
            withdrawal_id: id, school_id, amount: amount.0, started_at: env::block_timestamp(), active: true,
        });
        Promise::new(admin).transfer(NearToken::from_yoctonear(amount.0))
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_storage_withdrawal_complete(id))
    }

    pub fn finalize_storage_withdrawal_as_sent(&mut self, withdrawal_id: u64, evidence: String) {
        self.assert_owner();
        require!(evidence.len() <= MAX_EVIDENCE, "Evidence note is too long");
        let withdrawal = self.storage_withdrawals.get(&withdrawal_id).expect("Storage withdrawal not found");
        require!(withdrawal.active, "Storage withdrawal is not active");
        require!(env::block_timestamp() >= withdrawal.started_at.saturating_add(WAIT_NS), "Storage withdrawal recovery delay has not elapsed");
        self.storage_withdrawals.remove(&withdrawal_id);
        env::log_str(&format!("STORAGE_WITHDRAWAL_FINALIZED:{}:{}:{}", withdrawal_id, withdrawal.school_id, evidence));
    }

    #[private]
    pub fn on_storage_withdrawal_complete(&mut self, withdrawal_id: u64) -> bool {
        let Some(withdrawal) = self.storage_withdrawals.get(&withdrawal_id) else { return false; };
        if !withdrawal.active { return false; }
        self.storage_withdrawals.remove(&withdrawal_id);
        if matches!(env::promise_result(0), PromiseResult::Successful(_)) { return true; }
        if let Some(mut school) = self.schools.get(&withdrawal.school_id) {
            school.storage_balance = school.storage_balance.checked_add(withdrawal.amount).expect("Storage balance overflow");
            self.prepaid_storage_total = self.prepaid_storage_total.checked_add(withdrawal.amount).expect("Storage liability overflow");
            self.schools.insert(&withdrawal.school_id, &school);
            return true;
        }
        false
    }

    // ----- Invoice creation and payment acceptance -----

    pub fn create_invoice(&mut self, school_id: String, invoice_id: String, amount: U128, due_date: u64) {
        require!(!self.paused, "Contract is paused");
        let mut school = self.get_admin_school(&school_id);
        require!(school.status == SchoolStatus::Active, "School is not active");
        require!(Self::valid_invoice_id(&invoice_id), "Invoice id must be 32 lowercase hex characters");
        require!(!self.used_invoice_ids.contains(&invoice_id), "Invoice id has already been used");
        require!(amount.0 > 0 && amount.0 <= MAX_INVOICE, "Invoice amount is outside the allowed range");
        let before = env::storage_usage();
        let invoice = Invoice {
            invoice_id: invoice_id.clone(),
            school_id: school_id.clone(),
            amount: amount.0,
            due_date,
            status: InvoiceStatus::Pending,
            fee_bps: school.fee_bps,
            payer: None,
            treasury_snapshot: None,
            fee_amount: 0,
            net_amount: 0,
            paid_at: None,
            attempt_counter: 0,
            active_attempt_id: None,
            operation_type: None,
            operation_recipient: None,
            operation_amount: 0,
            operation_started_at: None,
            operation_from_recovered: false,
            recovery_count: 0,
            recovered_at: None,
        };
        self.invoices.insert(&invoice_id, &invoice);
        self.used_invoice_ids.insert(&invoice_id);
        let mut ids = self.school_invoice_ids.get(&school_id).unwrap_or_else(|| Vector::new(format!("school-invoices:{}", school_id).into_bytes()));
        ids.push(&invoice_id);
        self.school_invoice_ids.insert(&school_id, &ids);
        let bytes = env::storage_usage().saturating_sub(before) as u128;
        let cost = bytes.checked_mul(env::storage_byte_cost().as_yoctonear()).expect("Storage cost overflow");
        require!(school.storage_balance >= cost, "School storage balance is insufficient");
        school.storage_balance -= cost;
        self.prepaid_storage_total = self.prepaid_storage_total.checked_sub(cost).expect("Storage liability underflow");
        self.schools.insert(&school_id, &school);
    }

    pub fn cancel_invoice(&mut self, invoice_id: String) {
        let mut invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        let _school = self.get_admin_school(&invoice.school_id);
        require!(invoice.status == InvoiceStatus::Pending, "Only pending invoices can be cancelled");
        invoice.status = InvoiceStatus::Cancelled;
        self.invoices.insert(&invoice_id, &invoice);
    }

    #[private]
    pub fn _never_call_this() {
        env::panic_str("Not an external method");
    }

    // ----- Settlement, refund and recovery -----

    pub fn settle_invoice(&mut self, invoice_id: String) -> Promise {
        require!(!self.paused, "Contract is paused");
        let invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        require!(invoice.status == InvoiceStatus::PaymentReceived, "Invoice is not awaiting settlement");
        self.start_invoice_transfer(invoice, OperationType::Settle, false)
    }

    pub fn refund_payment(&mut self, invoice_id: String) -> Promise {
        let invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        self.assert_school_admin(&invoice.school_id);
        require!(invoice.status == InvoiceStatus::PaymentReceived, "Invoice is not refundable");
        self.start_invoice_transfer(invoice, OperationType::Refund, false)
    }

    pub fn restart_settlement(&mut self, invoice_id: String) -> Promise {
        require!(!self.paused, "Contract is paused");
        let invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        self.assert_owner_or_school_admin(&invoice.school_id);
        require!(invoice.status == InvoiceStatus::SettlementRecovered, "Invoice is not a recovered settlement");
        require!(env::block_timestamp() >= invoice.recovered_at.unwrap_or(0).saturating_add(WAIT_NS), "Restart delay has not elapsed");
        self.start_invoice_transfer(invoice, OperationType::Settle, true)
    }

    pub fn restart_refund(&mut self, invoice_id: String) -> Promise {
        let invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        self.assert_owner_or_school_admin(&invoice.school_id);
        require!(invoice.status == InvoiceStatus::RefundRecovered, "Invoice is not a recovered refund");
        require!(env::block_timestamp() >= invoice.recovered_at.unwrap_or(0).saturating_add(WAIT_NS), "Restart delay has not elapsed");
        self.start_invoice_transfer(invoice, OperationType::Refund, true)
    }

    pub fn retry_with_collateral(&mut self, invoice_id: String, evidence: String) {
        self.assert_owner();
        require!(self.allow_retry, "Collateral recovery is disabled");
        require!(evidence.len() <= MAX_EVIDENCE, "Evidence note is too long");
        let mut invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        require!(invoice.status == InvoiceStatus::Settling || invoice.status == InvoiceStatus::Refunding, "Invoice is not frozen");
        require!(env::block_timestamp() >= invoice.operation_started_at.unwrap_or(0).saturating_add(WAIT_NS), "Recovery delay has not elapsed");
        require!(invoice.recovery_count < MAX_RECOVERIES, "Invoice recovery limit reached");
        let collateral = if invoice.operation_type == Some(OperationType::Settle) { invoice.net_amount } else { invoice.amount };
        require!(self.fees_available >= collateral, "Insufficient platform fees for collateral");
        require!(self.lifetime_collateral.checked_add(collateral).unwrap_or(u128::MAX) <= MAX_LIFETIME_COLLATERAL, "Lifetime collateral limit reached");
        match invoice.operation_type.expect("Operation type missing") {
            OperationType::Settle => {
                self.settling_gross = self.settling_gross.checked_sub(invoice.amount).expect("Ledger underflow");
                self.settling_fee = self.settling_fee.checked_sub(invoice.fee_amount).expect("Ledger underflow");
                self.held = self.held.checked_add(invoice.amount).expect("Ledger overflow");
                self.fees_available -= collateral;
                invoice.status = InvoiceStatus::SettlementRecovered;
            }
            OperationType::Refund => {
                self.refunding_gross = self.refunding_gross.checked_sub(invoice.amount).expect("Ledger underflow");
                self.held = self.held.checked_add(invoice.amount).expect("Ledger overflow");
                self.fees_available -= collateral;
                invoice.status = InvoiceStatus::RefundRecovered;
            }
        }
        self.lifetime_collateral += collateral;
        invoice.recovery_count += 1;
        invoice.attempt_counter = invoice.attempt_counter.checked_add(1).expect("Attempt counter overflow");
        invoice.active_attempt_id = None;
        invoice.operation_from_recovered = true;
        invoice.recovered_at = Some(env::block_timestamp());
        self.invoices.insert(&invoice_id, &invoice);
        env::log_str(&format!("INVOICE_RECOVERED:{}:{}", invoice_id, evidence));
    }

    pub fn close_as_sent(&mut self, invoice_id: String, evidence: String) {
        self.assert_owner();
        require!(evidence.len() <= MAX_EVIDENCE, "Evidence note is too long");
        let mut invoice = self.invoices.get(&invoice_id).expect("Invoice not found");
        let now = env::block_timestamp();
        match invoice.status {
            InvoiceStatus::Settling | InvoiceStatus::Refunding => {
                require!(now >= invoice.operation_started_at.unwrap_or(0).saturating_add(WAIT_NS), "Close delay has not elapsed");
                match invoice.operation_type.expect("Operation type missing") {
                    OperationType::Settle => {
                        self.settling_gross -= invoice.amount;
                        self.settling_fee -= invoice.fee_amount;
                        self.fees_available = self.fees_available.checked_add(invoice.fee_amount).expect("Fee overflow");
                        invoice.status = InvoiceStatus::Paid;
                    }
                    OperationType::Refund => {
                        self.refunding_gross -= invoice.amount;
                        invoice.status = InvoiceStatus::Refunded;
                    }
                }
            }
            InvoiceStatus::SettlementRecovered | InvoiceStatus::RefundRecovered => {
                require!(now >= invoice.recovered_at.unwrap_or(0).saturating_add(WAIT_NS), "Close delay has not elapsed");
                match invoice.operation_type.expect("Operation type missing") {
                    OperationType::Settle => {
                        self.held -= invoice.amount;
                        self.fees_available = self.fees_available.checked_add(invoice.fee_amount).expect("Fee overflow");
                        invoice.status = InvoiceStatus::Paid;
                    }
                    OperationType::Refund => {
                        self.held -= invoice.amount;
                        invoice.status = InvoiceStatus::Refunded;
                    }
                }
            }
            _ => env::panic_str("Invoice is not frozen or recovered"),
        }
        invoice.attempt_counter = invoice.attempt_counter.checked_add(1).expect("Attempt counter overflow");
        Self::clear_operation(&mut invoice);
        self.invoices.insert(&invoice_id, &invoice);
        env::log_str(&format!("INVOICE_CLOSED_AS_SENT:{}:{}", invoice_id, evidence));
    }

    // ----- Platform fees and treasury -----

    pub fn set_platform_treasury(&mut self, account_id: AccountId) -> Promise {
        self.assert_owner();
        self.ensure_async_resources();
        require!(self.pending_platform_treasury.is_none(), "A platform treasury verification is already pending");
        require!(account_id != self.owner && account_id != env::current_account_id() && account_id != self.usdc_token, "Platform treasury must be a separate account");
        require!(self.admin_index.get(&account_id).is_none(), "A school administrator cannot be the platform treasury");
        require!(self.treasury_index.get(&account_id).is_none(), "A school treasury cannot be the platform treasury");
        self.pending_platform_treasury = Some(account_id.clone());
        self.pending_platform_treasury_started_at = Some(env::block_timestamp());
        self.pending_platform_treasury_nonce = self.pending_platform_treasury_nonce.checked_add(1).expect("Platform treasury nonce overflow");
        let nonce = self.pending_platform_treasury_nonce;
        ext_ft::ext(self.usdc_token.clone())
            .with_static_gas(FT_GAS)
            .storage_balance_of(account_id.clone())
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_platform_treasury_check(account_id, nonce))
    }

    #[private]
    pub fn on_platform_treasury_check(&mut self, account_id: AccountId, nonce: u64) -> bool {
        if self.pending_platform_treasury.as_ref() != Some(&account_id) || self.pending_platform_treasury_nonce != nonce { return false; }
        let registered = Self::storage_balance_result();
        let available = registered && account_id != self.owner && account_id != self.usdc_token
            && self.admin_index.get(&account_id).is_none()
            && self.treasury_index.get(&account_id).is_none();
        self.pending_platform_treasury = None;
        self.pending_platform_treasury_started_at = None;
        if !available { return false; }
        self.platform_treasury = Some(account_id);
        self.platform_treasury_verified = true;
        true
    }

    pub fn cancel_platform_treasury_verification(&mut self) {
        self.assert_owner();
        let started = self.pending_platform_treasury_started_at.expect("No platform treasury verification is pending");
        require!(self.pending_platform_treasury.is_some(), "No platform treasury verification is pending");
        require!(env::block_timestamp() >= started.saturating_add(WAIT_NS), "Platform treasury cancellation delay has not elapsed");
        self.pending_platform_treasury = None;
        self.pending_platform_treasury_started_at = None;
        self.pending_platform_treasury_nonce = self.pending_platform_treasury_nonce.checked_add(1).expect("Platform treasury nonce overflow");
    }

    pub fn withdraw_fees(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        self.ensure_async_resources();
        require!(!self.paused, "Contract is paused");
        require!(amount.0 > 0 && amount.0 <= self.fees_available, "Amount exceeds available platform fees");
        require!(self.platform_treasury_verified, "Platform treasury is not configured and verified");
        let recipient = self.platform_treasury.clone().expect("Platform treasury missing");
        let id = self.next_withdrawal_id;
        self.next_withdrawal_id = self.next_withdrawal_id.checked_add(1).expect("Withdrawal id overflow");
        let withdrawal = Withdrawal {
            withdrawal_id: id,
            amount: amount.0,
            recipient: recipient.clone(),
            started_at: env::block_timestamp(),
            active: true,
        };
        self.fees_available -= amount.0;
        self.fees_in_flight = self.fees_in_flight.checked_add(amount.0).expect("Ledger overflow");
        self.withdrawals.insert(&id, &withdrawal);
        ext_ft::ext(self.usdc_token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(FT_GAS)
            .ft_transfer(recipient, amount, Some(format!("StudentFee v3 platform fee withdrawal {}", id)))
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_fee_withdrawal_complete(id))
    }

    #[private]
    pub fn on_fee_withdrawal_complete(&mut self, withdrawal_id: u64) -> bool {
        let Some(withdrawal) = self.withdrawals.get(&withdrawal_id) else { return false; };
        if !withdrawal.active { return false; }
        self.withdrawals.remove(&withdrawal_id);
        self.fees_in_flight = self.fees_in_flight.checked_sub(withdrawal.amount).expect("Ledger underflow");
        if !matches!(env::promise_result(0), PromiseResult::Successful(_)) {
            self.fees_available = self.fees_available.checked_add(withdrawal.amount).expect("Fee overflow");
        }
        true
    }

    pub fn finalize_withdrawal_as_sent(&mut self, withdrawal_id: u64) {
        self.assert_owner();
        let withdrawal = self.withdrawals.get(&withdrawal_id).expect("Withdrawal not found");
        require!(withdrawal.active, "Withdrawal is already finalized");
        require!(env::block_timestamp() >= withdrawal.started_at.saturating_add(WAIT_NS), "Withdrawal wait has not elapsed");
        self.withdrawals.remove(&withdrawal_id);
        self.fees_in_flight -= withdrawal.amount;
        env::log_str(&format!("FEE_WITHDRAWAL_FINALIZED:{}", withdrawal_id));
    }

    // ----- Pause and views -----

    pub fn pause(&mut self) { self.assert_owner(); self.paused = true; }
    pub fn unpause(&mut self) { self.assert_owner(); self.paused = false; }
    pub fn set_allow_retry(&mut self, allow: bool) { self.assert_owner(); self.allow_retry = allow; }

    pub fn get_withdrawal(&self, withdrawal_id: u64) -> Option<WithdrawalView> {
        self.withdrawals.get(&withdrawal_id).map(Into::into)
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            usdc_token: self.usdc_token.clone(),
            platform_treasury: self.platform_treasury.clone(),
            pending_platform_treasury: self.pending_platform_treasury.clone(),
            paused: self.paused,
            allow_retry: self.allow_retry,
            default_fee_bps: DEFAULT_FEE_BPS,
            max_fee_bps: MAX_FEE_BPS,
            max_invoice: U128(MAX_INVOICE),
            max_at_risk: U128(MAX_AT_RISK),
            max_lifetime_collateral: U128(MAX_LIFETIME_COLLATERAL),
        }
    }

    pub fn get_school(&self, school_id: String) -> Option<SchoolView> { self.schools.get(&school_id).map(Into::into) }
    pub fn get_invoice(&self, invoice_id: String) -> Option<InvoiceView> { self.invoices.get(&invoice_id).map(Into::into) }
    pub fn get_school_for_admin(&self, admin: AccountId) -> Option<String> { self.admin_index.get(&admin) }
    pub fn get_schools(&self, from_index: u64, limit: u64) -> Vec<SchoolView> {
        let end = from_index.saturating_add(limit.min(100)).min(self.next_school_id);
        (from_index..end)
            .filter_map(|index| self.schools.get(&format!("{:032x}", index)).map(Into::into))
            .collect()
    }
    pub fn get_school_invoice_ids(&self, school_id: String, from_index: u64, limit: u64) -> Vec<String> {
        let Some(ids) = self.school_invoice_ids.get(&school_id) else { return Vec::new(); };
        let end = from_index.saturating_add(limit.min(100)).min(ids.len());
        (from_index..end).filter_map(|index| ids.get(index)).collect()
    }
    pub fn get_school_invoices(&self, school_id: String, from_index: u64, limit: u64) -> Vec<InvoiceView> {
        self.get_school_invoice_ids(school_id, from_index, limit).into_iter().filter_map(|id| self.invoices.get(&id).map(Into::into)).collect()
    }
    pub fn get_accounting(&self) -> Accounting {
        let min_liability = self.held + self.settling_fee + self.fees_available;
        let max_liability = self.held + self.settling_gross + self.refunding_gross + self.fees_available + self.fees_in_flight;
        let money_at_risk = self.held + self.settling_gross + self.refunding_gross;
        Accounting {
            held: U128(self.held),
            settling_gross: U128(self.settling_gross),
            settling_fee: U128(self.settling_fee),
            refunding_gross: U128(self.refunding_gross),
            fees_available: U128(self.fees_available),
            fees_in_flight: U128(self.fees_in_flight),
            lifetime_collateral: U128(self.lifetime_collateral),
            min_liability: U128(min_liability),
            max_liability: U128(max_liability),
            money_at_risk: U128(money_at_risk),
        }
    }

    // ----- Internal helpers -----

    fn start_invoice_transfer(&mut self, mut invoice: Invoice, operation: OperationType, recovered: bool) -> Promise {
        self.ensure_async_resources();
        let now = env::block_timestamp();
        if recovered {
            require!(invoice.operation_type == Some(operation), "Recovered operation type mismatch");
            let expected_recipient = if operation == OperationType::Settle {
                invoice.treasury_snapshot.clone().expect("Treasury snapshot missing")
            } else { invoice.payer.clone().expect("Payer snapshot missing") };
            let expected_amount = if operation == OperationType::Settle { invoice.net_amount } else { invoice.amount };
            require!(invoice.operation_recipient.as_ref() == Some(&expected_recipient), "Pinned recipient mismatch");
            require!(invoice.operation_amount == expected_amount, "Pinned amount mismatch");
        } else {
            let payer = invoice.payer.clone().expect("Payer snapshot missing");
            let treasury = invoice.treasury_snapshot.clone().expect("Treasury snapshot missing");
            invoice.operation_type = Some(operation);
            invoice.operation_recipient = Some(if operation == OperationType::Settle { treasury } else { payer });
            invoice.operation_amount = if operation == OperationType::Settle { invoice.net_amount } else { invoice.amount };
        }
        invoice.attempt_counter = invoice.attempt_counter.checked_add(1).expect("Attempt counter overflow");
        let attempt_id = invoice.attempt_counter;
        invoice.active_attempt_id = Some(attempt_id);
        invoice.operation_started_at = Some(now);
        invoice.operation_from_recovered = recovered;
        match operation {
            OperationType::Settle => {
                self.held = self.held.checked_sub(invoice.amount).expect("Ledger underflow");
                self.settling_gross = self.settling_gross.checked_add(invoice.amount).expect("Ledger overflow");
                self.settling_fee = self.settling_fee.checked_add(invoice.fee_amount).expect("Ledger overflow");
                invoice.status = InvoiceStatus::Settling;
            }
            OperationType::Refund => {
                self.held = self.held.checked_sub(invoice.amount).expect("Ledger underflow");
                self.refunding_gross = self.refunding_gross.checked_add(invoice.amount).expect("Ledger overflow");
                invoice.status = InvoiceStatus::Refunding;
            }
        }
        let recipient = invoice.operation_recipient.clone().expect("Operation recipient missing");
        let amount = invoice.operation_amount;
        let invoice_id = invoice.invoice_id.clone();
        self.invoices.insert(&invoice_id, &invoice);
        ext_ft::ext(self.usdc_token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(FT_GAS)
            .ft_transfer(recipient, U128(amount), Some(format!("StudentFee v3 invoice {}", invoice_id)))
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS)
                .on_transfer_complete(invoice_id, attempt_id, operation))
    }

    #[private]
    pub fn on_transfer_complete(&mut self, invoice_id: String, attempt_id: u64, operation: OperationType) -> bool {
        let Some(mut invoice) = self.invoices.get(&invoice_id) else { return false; };
        let expected_status = if operation == OperationType::Settle { InvoiceStatus::Settling } else { InvoiceStatus::Refunding };
        if invoice.active_attempt_id != Some(attempt_id) || invoice.operation_type != Some(operation) || invoice.status != expected_status {
            env::log_str(&format!("STALE_CALLBACK_IGNORED:{}:{}", invoice_id, attempt_id));
            return false;
        }
        let succeeded = matches!(env::promise_result(0), PromiseResult::Successful(_));
        match (operation, succeeded) {
            (OperationType::Settle, true) => {
                self.settling_gross -= invoice.amount;
                self.settling_fee -= invoice.fee_amount;
                self.fees_available = self.fees_available.checked_add(invoice.fee_amount).expect("Fee overflow");
                invoice.status = InvoiceStatus::Paid;
                Self::clear_operation(&mut invoice);
            }
            (OperationType::Refund, true) => {
                self.refunding_gross -= invoice.amount;
                invoice.status = InvoiceStatus::Refunded;
                Self::clear_operation(&mut invoice);
            }
            (OperationType::Settle, false) => {
                self.settling_gross -= invoice.amount;
                self.settling_fee -= invoice.fee_amount;
                self.held = self.held.checked_add(invoice.amount).expect("Ledger overflow");
                invoice.status = if invoice.operation_from_recovered { InvoiceStatus::SettlementRecovered } else { InvoiceStatus::PaymentReceived };
                invoice.active_attempt_id = None;
                invoice.operation_started_at = None;
                if !invoice.operation_from_recovered { Self::clear_operation(&mut invoice); }
                if invoice.operation_from_recovered { invoice.recovered_at = Some(env::block_timestamp()); }
            }
            (OperationType::Refund, false) => {
                self.refunding_gross -= invoice.amount;
                self.held = self.held.checked_add(invoice.amount).expect("Ledger overflow");
                invoice.status = if invoice.operation_from_recovered { InvoiceStatus::RefundRecovered } else { InvoiceStatus::PaymentReceived };
                invoice.active_attempt_id = None;
                invoice.operation_started_at = None;
                if !invoice.operation_from_recovered { Self::clear_operation(&mut invoice); }
                if invoice.operation_from_recovered { invoice.recovered_at = Some(env::block_timestamp()); }
            }
        }
        self.invoices.insert(&invoice_id, &invoice);
        true
    }

    fn clear_operation(invoice: &mut Invoice) {
        invoice.active_attempt_id = None;
        invoice.operation_type = None;
        invoice.operation_recipient = None;
        invoice.operation_amount = 0;
        invoice.operation_started_at = None;
        invoice.operation_from_recovered = false;
        invoice.recovered_at = None;
    }

    fn storage_balance_result() -> bool {
        match env::promise_result(0) {
            PromiseResult::Successful(bytes) => near_sdk::serde_json::from_slice::<Option<StorageBalance>>(&bytes)
                .map(|balance| balance.is_some())
                .unwrap_or(false),
            _ => false,
        }
    }

    fn valid_invoice_id(id: &str) -> bool {
        id.len() == 32 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }

    fn get_admin_school(&self, school_id: &str) -> School {
        let school = self.schools.get(&school_id.to_string()).expect("School not found");
        require!(school.admin == env::predecessor_account_id(), "Not this school's administrator");
        school
    }

    fn assert_school_admin(&self, school_id: &str) {
        let school = self.schools.get(&school_id.to_string()).expect("School not found");
        require!(school.admin == env::predecessor_account_id(), "Not this school's administrator");
    }

    fn assert_owner_or_school_admin(&self, school_id: &str) {
        let caller = env::predecessor_account_id();
        if caller != self.owner {
            self.assert_school_admin(school_id);
        }
    }

    fn ensure_async_resources(&self) {
        require!(env::prepaid_gas() >= MIN_CALL_GAS, "Attach at least 70 Tgas for the asynchronous call and callback");
        self.ensure_free_near_reserve();
    }

    fn ensure_free_near_reserve(&self) {
        let storage_required = (env::storage_usage() as u128)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("Storage reserve calculation overflow");
        let committed = storage_required.checked_add(self.prepaid_storage_total).expect("NEAR reserve calculation overflow");
        let free = env::account_balance().as_yoctonear().checked_sub(committed).unwrap_or(0);
        require!(free >= MIN_FREE_NEAR_RESERVE, "Registry NEAR reserve is below 0.1 NEAR");
    }

    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner, "Only the platform owner"); }
}

#[near]
impl FungibleTokenReceiver for Contract {
    #[payable]
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        if env::predecessor_account_id() != self.usdc_token {
            return PromiseOrValue::Value(amount);
        }
        if self.paused { return PromiseOrValue::Value(amount); }
        let Some(mut invoice) = self.invoices.get(&msg) else { return PromiseOrValue::Value(amount); };
        let Some(school) = self.schools.get(&invoice.school_id) else { return PromiseOrValue::Value(amount); };
        if invoice.status != InvoiceStatus::Pending || school.status != SchoolStatus::Active || amount.0 != invoice.amount {
            return PromiseOrValue::Value(amount);
        }
        let money_at_risk = self.held.checked_add(self.settling_gross).and_then(|x| x.checked_add(self.refunding_gross)).unwrap_or(u128::MAX);
        if money_at_risk.checked_add(amount.0).unwrap_or(u128::MAX) > MAX_AT_RISK {
            return PromiseOrValue::Value(amount);
        }
        let fee = amount.0.checked_mul(invoice.fee_bps as u128).expect("Fee calculation overflow") / BPS;
        let net = amount.0.checked_sub(fee).expect("Fee exceeds amount");
        invoice.payer = Some(sender_id);
        invoice.treasury_snapshot = Some(school.treasury.clone());
        invoice.fee_amount = fee;
        invoice.net_amount = net;
        invoice.paid_at = Some(env::block_timestamp());
        invoice.status = InvoiceStatus::PaymentReceived;
        self.held = self.held.checked_add(amount.0).expect("Ledger overflow");
        self.invoices.insert(&msg, &invoice);
        PromiseOrValue::Value(U128(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{testing_env_with_promise_results, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};

    const GROSS: u128 = 100_000_000; // 100 USDC
    const FEE: u128 = 1_000_000;     // 1 USDC at 1%
    const NET: u128 = 99_000_000;    // 99 USDC
    const SCHOOL_ID: &str = "00000000000000000000000000000001";
    const INVOICE_ID: &str = "0123456789abcdef0123456789abcdef";

    fn account(value: &str) -> AccountId { value.parse().unwrap() }

    fn context(predecessor: &str, timestamp: u64, result: Option<PromiseResult>) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("registry.testnet"))
            .predecessor_account_id(account(predecessor))
            .block_timestamp(timestamp)
            .account_balance(NearToken::from_near(10))
            .prepaid_gas(Gas::from_tgas(300))
            .attached_deposit(NearToken::from_yoctonear(0));
        match result {
            Some(promise_result) => testing_env_with_promise_results(builder.build(), promise_result),
            None => testing_env!(builder.build()),
        }
    }

    fn funded_contract() -> (Contract, AccountId, AccountId) {
        let owner = account("owner.testnet");
        let admin = account("school.testnet");
        let token = account("usdc.testnet");
        context("owner.testnet", 1, None);
        let mut contract = Contract::new(owner.clone(), token);
        let school = School {
            school_id: SCHOOL_ID.to_string(),
            name: "Test School".to_string(),
            description: "Contract test fixture".to_string(),
            admin: admin.clone(),
            treasury: account("treasury.testnet"),
            status: SchoolStatus::Active,
            treasury_verified: true,
            fee_bps: DEFAULT_FEE_BPS,
            storage_balance: 1_000_000_000_000_000_000_000_000,
            registration_storage_cost: 0,
            created_at: 1,
            queued_treasury: None,
            treasury_effective_at: None,
            proposed_admin: None,
            approval_pending: false,
            approval_started_at: None,
            approval_nonce: 0,
            treasury_change_nonce: 0,
            reactivation_pending: false,
            reactivation_started_at: None,
            reactivation_nonce: 0,
        };
        contract.schools.insert(&SCHOOL_ID.to_string(), &school);
        contract.admin_index.insert(&admin, &SCHOOL_ID.to_string());
        contract.treasury_index.insert(&account("treasury.testnet"), &SCHOOL_ID.to_string());
        contract.prepaid_storage_total = school.storage_balance;

        context("school.testnet", 2, None);
        contract.create_invoice(SCHOOL_ID.to_string(), INVOICE_ID.to_string(), U128(GROSS), 0);

        context("usdc.testnet", 3, None);
        let accepted = contract.ft_on_transfer(account("parent.testnet"), U128(GROSS), INVOICE_ID.to_string());
        assert!(matches!(accepted, PromiseOrValue::Value(value) if value.0 == 0));
        (contract, owner, admin)
    }

    fn assert_ledger_invariants(contract: &Contract) {
        let mut held = 0u128;
        let mut settling = 0u128;
        let mut settling_fee = 0u128;
        let mut refunding = 0u128;
        for (_, invoice) in contract.invoices.iter() {
            match invoice.status {
                InvoiceStatus::PaymentReceived | InvoiceStatus::SettlementRecovered | InvoiceStatus::RefundRecovered => {
                    held = held.checked_add(invoice.amount).unwrap();
                }
                InvoiceStatus::Settling => {
                    settling = settling.checked_add(invoice.amount).unwrap();
                    settling_fee = settling_fee.checked_add(invoice.fee_amount).unwrap();
                }
                InvoiceStatus::Refunding => {
                    refunding = refunding.checked_add(invoice.amount).unwrap();
                }
                _ => {}
            }
        }
        assert_eq!(contract.held, held);
        assert_eq!(contract.settling_gross, settling);
        assert_eq!(contract.settling_fee, settling_fee);
        assert_eq!(contract.refunding_gross, refunding);
        assert!(held + settling + refunding <= MAX_AT_RISK);
        assert!(contract.lifetime_collateral <= MAX_LIFETIME_COLLATERAL);
        let min_liability = held + settling_fee + contract.fees_available;
        let max_liability = held + settling + refunding + contract.fees_available + contract.fees_in_flight;
        assert!(min_liability <= max_liability);
    }

    #[test]
    fn two_school_settlement_refund_and_fee_withdrawal_preserve_all_ledger_buckets() {
        let (mut contract, _, _) = funded_contract();
        const SECOND_SCHOOL: &str = "00000000000000000000000000000002";
        const SECOND_INVOICE: &str = "fedcba9876543210fedcba9876543210";
        let second_admin = account("other-school.testnet");
        let second_school = School {
            school_id: SECOND_SCHOOL.to_string(),
            name: "Other School".to_string(),
            description: "Accounting fixture".to_string(),
            admin: second_admin.clone(),
            treasury: account("other-treasury.testnet"),
            status: SchoolStatus::Active,
            treasury_verified: true,
            fee_bps: DEFAULT_FEE_BPS,
            storage_balance: 1_000_000_000_000_000_000_000_000,
            registration_storage_cost: 0,
            created_at: 1,
            queued_treasury: None,
            treasury_effective_at: None,
            proposed_admin: None,
            approval_pending: false,
            approval_started_at: None,
            approval_nonce: 0,
            treasury_change_nonce: 0,
            reactivation_pending: false,
            reactivation_started_at: None,
            reactivation_nonce: 0,
        };
        contract.schools.insert(&SECOND_SCHOOL.to_string(), &second_school);
        contract.admin_index.insert(&second_admin, &SECOND_SCHOOL.to_string());
        contract.treasury_index.insert(&second_school.treasury, &SECOND_SCHOOL.to_string());
        contract.prepaid_storage_total += second_school.storage_balance;

        context("other-school.testnet", 4, None);
        contract.create_invoice(SECOND_SCHOOL.to_string(), SECOND_INVOICE.to_string(), U128(GROSS), 0);
        context("usdc.testnet", 5, None);
        let accepted = contract.ft_on_transfer(account("parent-two.testnet"), U128(GROSS), SECOND_INVOICE.to_string());
        assert!(matches!(accepted, PromiseOrValue::Value(value) if value.0 == 0));
        assert_ledger_invariants(&contract);
        assert_eq!(contract.get_schools(0, 100).len(), 2);
        assert_eq!(contract.get_school_invoice_ids(SCHOOL_ID.to_string(), 0, 100), vec![INVOICE_ID.to_string()]);
        assert_eq!(contract.get_school_invoice_ids(SECOND_SCHOOL.to_string(), 0, 100), vec![SECOND_INVOICE.to_string()]);
        assert_eq!(contract.get_school_invoices(SECOND_SCHOOL.to_string(), 0, 100).len(), 1);

        context("anyone.testnet", 6, None);
        let _settle = contract.settle_invoice(INVOICE_ID.to_string());
        assert_ledger_invariants(&contract);
        context("other-school.testnet", 7, None);
        let _refund = contract.refund_payment(SECOND_INVOICE.to_string());
        assert_ledger_invariants(&contract);

        context("registry.testnet", 8, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        assert_ledger_invariants(&contract);
        assert_eq!(contract.fees_available, FEE);

        contract.platform_treasury = Some(account("platform-treasury.testnet"));
        contract.platform_treasury_verified = true;
        context("owner.testnet", 9, None);
        let _withdrawal = contract.withdraw_fees(U128(FEE));
        assert_ledger_invariants(&contract);
        assert_eq!(contract.fees_in_flight, FEE);
        context("registry.testnet", 10, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_fee_withdrawal_complete(0));
        assert_ledger_invariants(&contract);

        context("registry.testnet", 11, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(SECOND_INVOICE.to_string(), 1, OperationType::Refund));
        assert_ledger_invariants(&contract);
        assert_eq!(contract.held, 0);
        assert_eq!(contract.settling_gross, 0);
        assert_eq!(contract.refunding_gross, 0);
        assert_eq!(contract.fees_available, 0);
        assert_eq!(contract.fees_in_flight, 0);
    }

    #[test]
    fn owner_cannot_become_a_school_or_platform_treasury() {
        let (mut contract, _, _) = funded_contract();
        context("owner.testnet", 4, None);
        let school_treasury = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.propose_owner(account("treasury.testnet"));
        }));
        assert!(school_treasury.is_err());
        contract.platform_treasury = Some(account("platform-treasury.testnet"));
        let platform_treasury = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.propose_owner(account("platform-treasury.testnet"));
        }));
        assert!(platform_treasury.is_err());
        assert_eq!(contract.owner, account("owner.testnet"));
        assert_eq!(contract.proposed_owner, None);
    }

    #[test]
    fn platform_treasury_verification_is_single_flight_and_stale_safe() {
        let (mut contract, _, _) = funded_contract();
        context("owner.testnet", 4, None);
        let _first = contract.set_platform_treasury(account("platform-treasury.testnet"));
        assert_eq!(contract.pending_platform_treasury, Some(account("platform-treasury.testnet")));
        let second = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.set_platform_treasury(account("other-platform-treasury.testnet"));
        }));
        assert!(second.is_err());

        context("owner.testnet", 4 + WAIT_NS, None);
        contract.cancel_platform_treasury_verification();
        context("registry.testnet", 5 + WAIT_NS, Some(PromiseResult::Successful(vec![])));
        assert!(!contract.on_platform_treasury_check(account("platform-treasury.testnet"), 1));
        assert_eq!(contract.platform_treasury, None);

        context("owner.testnet", 6 + WAIT_NS, None);
        let _second_attempt = contract.set_platform_treasury(account("platform-treasury.testnet"));
        let balance = StorageBalance { total: U128(1), available: U128(0) };
        let result = near_sdk::serde_json::to_vec(&Some(balance)).unwrap();
        context("registry.testnet", 7 + WAIT_NS, Some(PromiseResult::Successful(result.clone())));
        assert!(contract.on_platform_treasury_check(account("platform-treasury.testnet"), 3));
        assert_eq!(contract.platform_treasury, Some(account("platform-treasury.testnet")));
        assert_eq!(contract.pending_platform_treasury, None);
        assert!(!contract.on_platform_treasury_check(account("platform-treasury.testnet"), 3));
        assert_eq!(contract.platform_treasury, Some(account("platform-treasury.testnet")));
    }

    #[test]
    fn school_becomes_active_only_after_owner_approval_and_treasury_reverification() {
        let (mut contract, _, _) = funded_contract();
        let mut school = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        school.status = SchoolStatus::PendingApproval;
        school.treasury_verified = true;
        contract.schools.insert(&SCHOOL_ID.to_string(), &school);

        context("school.testnet", 4, None);
        let before_approval = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.create_invoice(SCHOOL_ID.to_string(), "abcdef0123456789abcdef0123456789".to_string(), U128(GROSS), 0);
        }));
        assert!(before_approval.is_err());

        context("owner.testnet", 5, None);
        let _failed_check = contract.approve_school(SCHOOL_ID.to_string(), 500);
        context("registry.testnet", 6, Some(PromiseResult::Failed));
        assert!(!contract.on_approval_treasury_check(SCHOOL_ID.to_string(), 500, account("treasury.testnet"), 1));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().status, SchoolStatus::PendingApproval);

        context("owner.testnet", 7, None);
        let _approval = contract.approve_school(SCHOOL_ID.to_string(), 500);
        let balance = StorageBalance { total: U128(1), available: U128(0) };
        let result = near_sdk::serde_json::to_vec(&Some(balance)).unwrap();
        context("registry.testnet", 8, Some(PromiseResult::Successful(result)));
        assert!(contract.on_approval_treasury_check(SCHOOL_ID.to_string(), 500, account("treasury.testnet"), 2));
        let approved = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        assert_eq!(approved.status, SchoolStatus::Active);
        assert_eq!(approved.fee_bps, 500);
    }

    #[test]
    fn school_registration_charges_measured_storage_and_refunds_full_deposit_on_failure() {
        let owner = account("owner.testnet");
        let token = account("usdc.testnet");
        context("owner.testnet", 1, None);
        let mut contract = Contract::new(owner, token);
        let deposit = NearToken::from_near(1).as_yoctonear();

        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("registry.testnet"))
            .predecessor_account_id(account("new-school.testnet"))
            .block_timestamp(2)
            .account_balance(NearToken::from_near(10))
            .prepaid_gas(Gas::from_tgas(300))
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(builder.build());

        let _promise = contract.register_school(
            "New School".to_string(),
            "Registration test".to_string(),
            account("new-treasury.testnet"),
        );
        let school_id = "00000000000000000000000000000000".to_string();
        let school = contract.schools.get(&school_id).unwrap();
        assert!(school.registration_storage_cost > 0);
        assert_eq!(school.storage_balance + school.registration_storage_cost, deposit);
        assert_eq!(contract.prepaid_storage_total, school.storage_balance);

        context("registry.testnet", 3, Some(PromiseResult::Failed));
        assert!(!contract.on_school_treasury_check(school_id.clone(), account("new-school.testnet")));
        assert!(contract.schools.get(&school_id).is_none());
        assert!(contract.admin_index.get(&account("new-school.testnet")).is_none());
        assert_eq!(contract.prepaid_storage_total, 0);

        let mut second_builder = VMContextBuilder::new();
        second_builder
            .current_account_id(account("registry.testnet"))
            .predecessor_account_id(account("second-school.testnet"))
            .block_timestamp(4)
            .account_balance(NearToken::from_near(10))
            .prepaid_gas(Gas::from_tgas(300))
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(second_builder.build());
        let _second_promise = contract.register_school(
            "Second School".to_string(),
            "Successful registration".to_string(),
            account("second-treasury.testnet"),
        );
        let second_id = "00000000000000000000000000000001".to_string();
        let storage_balance = StorageBalance { total: U128(deposit), available: U128(0) };
        let result = near_sdk::serde_json::to_vec(&Some(storage_balance)).unwrap();
        context("registry.testnet", 5, Some(PromiseResult::Successful(result)));
        assert!(contract.on_school_treasury_check(second_id.clone(), account("second-school.testnet")));
        let registered = contract.schools.get(&second_id).unwrap();
        assert!(registered.treasury_verified);
        assert_eq!(registered.status, SchoolStatus::PendingApproval);
        assert_eq!(contract.treasury_index.get(&account("second-treasury.testnet")), Some(second_id.clone()));
        assert_eq!(contract.prepaid_storage_total, registered.storage_balance);
        let schools = contract.get_schools(0, 100);
        assert_eq!(schools.len(), 1);
        assert_eq!(schools[0].school_id, second_id);
        assert!(contract.get_schools(u64::MAX, 100).is_empty());
    }

    #[test]
    fn owner_can_cancel_a_timed_out_registration_and_late_callback_is_ignored() {
        let owner = account("owner.testnet");
        context("owner.testnet", 1, None);
        let mut contract = Contract::new(owner, account("usdc.testnet"));
        let deposit = NearToken::from_near(1).as_yoctonear();
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("registry.testnet"))
            .predecessor_account_id(account("pending-school.testnet"))
            .block_timestamp(2)
            .account_balance(NearToken::from_near(10))
            .prepaid_gas(Gas::from_tgas(300))
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(builder.build());
        let _registration = contract.register_school(
            "Pending School".to_string(),
            "No treasury callback".to_string(),
            account("pending-treasury.testnet"),
        );
        let school_id = "00000000000000000000000000000000".to_string();
        context("owner.testnet", 3, None);
        let too_early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.cancel_school_registration(school_id.clone());
        }));
        assert!(too_early.is_err());

        context("owner.testnet", 2 + WAIT_NS, None);
        contract.cancel_school_registration(school_id.clone());
        assert!(contract.schools.get(&school_id).is_none());
        assert!(contract.admin_index.get(&account("pending-school.testnet")).is_none());
        assert_eq!(contract.prepaid_storage_total, 0);

        let balance = StorageBalance { total: U128(deposit), available: U128(0) };
        let result = near_sdk::serde_json::to_vec(&Some(balance)).unwrap();
        context("registry.testnet", 3 + WAIT_NS, Some(PromiseResult::Successful(result)));
        assert!(!contract.on_school_treasury_check(school_id, account("pending-school.testnet")));
        assert_eq!(contract.schools.len(), 0);
        assert_eq!(contract.prepaid_storage_total, 0);
    }

    #[test]
    fn reactivation_is_single_flight_and_stale_callbacks_cannot_unsuspend_a_school() {
        let (mut contract, _, _) = funded_contract();
        let mut school = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        school.status = SchoolStatus::Suspended;
        contract.schools.insert(&SCHOOL_ID.to_string(), &school);

        context("owner.testnet", 4, None);
        let _promise = contract.reactivate_school(SCHOOL_ID.to_string());
        assert!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().reactivation_pending);
        let duplicate = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.reactivate_school(SCHOOL_ID.to_string());
        }));
        assert!(duplicate.is_err());

        let storage_balance = StorageBalance { total: U128(1), available: U128(0) };
        let result = near_sdk::serde_json::to_vec(&Some(storage_balance)).unwrap();
        context("registry.testnet", 5, Some(PromiseResult::Successful(result.clone())));
        assert!(contract.on_reactivate_school_check(SCHOOL_ID.to_string(), account("treasury.testnet"), 1));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().status, SchoolStatus::Active);
        assert!(!contract.schools.get(&SCHOOL_ID.to_string()).unwrap().reactivation_pending);

        context("owner.testnet", 6, None);
        contract.suspend_school(SCHOOL_ID.to_string());
        context("registry.testnet", 7, Some(PromiseResult::Successful(result.clone())));
        assert!(!contract.on_reactivate_school_check(SCHOOL_ID.to_string(), account("treasury.testnet"), 2));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().status, SchoolStatus::Suspended);

        context("owner.testnet", 8, None);
        let _second = contract.reactivate_school(SCHOOL_ID.to_string());
        context("owner.testnet", 8 + WAIT_NS, None);
        contract.cancel_reactivation(SCHOOL_ID.to_string());
        assert!(!contract.schools.get(&SCHOOL_ID.to_string()).unwrap().reactivation_pending);
        context("registry.testnet", 9 + WAIT_NS, Some(PromiseResult::Successful(result.clone())));
        assert!(!contract.on_reactivate_school_check(SCHOOL_ID.to_string(), account("treasury.testnet"), 2));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().status, SchoolStatus::Suspended);

        let mut school = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        contract.treasury_index.remove(&school.treasury);
        school.treasury = account("new-treasury.testnet");
        school.treasury_verified = false;
        contract.treasury_index.insert(&school.treasury, &SCHOOL_ID.to_string());
        contract.schools.insert(&SCHOOL_ID.to_string(), &school);
        context("owner.testnet", 10 + WAIT_NS, None);
        let _third = contract.reactivate_school(SCHOOL_ID.to_string());
        context("registry.testnet", 11 + WAIT_NS, Some(PromiseResult::Successful(result.clone())));
        assert!(!contract.on_reactivate_school_check(SCHOOL_ID.to_string(), account("treasury.testnet"), 2));
        assert!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().reactivation_pending);
        assert!(contract.on_reactivate_school_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 4));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().status, SchoolStatus::Active);
    }

    #[test]
    fn treasury_accounts_cannot_register_as_school_administrators() {
        let (mut contract, _, _) = funded_contract();
        context("treasury.testnet", 4, None);
        let school_treasury = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.register_school("Impostor School".to_string(), "".to_string(), account("new-treasury.testnet"));
        }));
        assert!(school_treasury.is_err());

        contract.platform_treasury = Some(account("platform-treasury.testnet"));
        context("platform-treasury.testnet", 5, None);
        let platform_treasury = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.register_school("Impostor School".to_string(), "".to_string(), account("new-treasury.testnet"));
        }));
        assert!(platform_treasury.is_err());
        assert_eq!(contract.schools.len(), 1);
    }

    #[test]
    fn ownership_and_administrator_acceptance_recheck_role_indexes() {
        let (mut contract, _, _) = funded_contract();
        let candidate = account("role-candidate.testnet");
        context("owner.testnet", 4, None);
        contract.propose_owner(candidate.clone());
        contract.treasury_index.insert(&candidate, &SCHOOL_ID.to_string());
        context("role-candidate.testnet", 5, None);
        let accept_owner = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.accept_owner();
        }));
        assert!(accept_owner.is_err());
        assert_eq!(contract.owner, account("owner.testnet"));

        contract.treasury_index.remove(&candidate);
        context("school.testnet", 6, None);
        contract.propose_admin(SCHOOL_ID.to_string(), candidate.clone());
        contract.platform_treasury = Some(candidate.clone());
        contract.platform_treasury_verified = true;
        context("role-candidate.testnet", 7, None);
        let accept_admin = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.accept_admin(SCHOOL_ID.to_string());
        }));
        assert!(accept_admin.is_err());
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().admin, account("school.testnet"));
        assert_eq!(contract.admin_index.get(&candidate), None);
    }

    #[test]
    fn school_and_platform_treasuries_cannot_become_school_admins() {
        let (mut contract, _, _) = funded_contract();
        context("school.testnet", 4, None);
        let school_treasury = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.propose_admin(SCHOOL_ID.to_string(), account("treasury.testnet"));
        }));
        assert!(school_treasury.is_err());

        contract.platform_treasury = Some(account("platform-treasury.testnet"));
        contract.platform_treasury_verified = true;
        let platform_treasury = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.propose_admin(SCHOOL_ID.to_string(), account("platform-treasury.testnet"));
        }));
        assert!(platform_treasury.is_err());
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().proposed_admin, None);
    }

    #[test]
    fn failed_storage_withdrawal_restores_once_and_ignores_replay() {
        let (mut contract, _, _) = funded_contract();
        let amount = 250_000_000_000_000_000_000_000u128;
        let before = contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance;
        context("school.testnet", 4, None);
        let _promise = contract.withdraw_storage(SCHOOL_ID.to_string(), U128(amount));
        let after_start = contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance;
        assert_eq!(after_start, before - amount);
        assert_eq!(contract.prepaid_storage_total, after_start);

        context("registry.testnet", 5, Some(PromiseResult::Failed));
        assert!(contract.on_storage_withdrawal_complete(0));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance, before);
        assert_eq!(contract.prepaid_storage_total, before);

        context("registry.testnet", 6, Some(PromiseResult::Successful(vec![])));
        assert!(!contract.on_storage_withdrawal_complete(0));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance, before);
        assert_eq!(contract.prepaid_storage_total, before);
    }

    #[test]
    fn two_step_school_admin_transfer_updates_the_unique_admin_index() {
        let (mut contract, _, _) = funded_contract();
        let replacement = account("replacement-admin.testnet");
        context("school.testnet", 4, None);
        contract.propose_admin(SCHOOL_ID.to_string(), replacement.clone());
        assert_eq!(contract.admin_index.get(&account("school.testnet")), Some(SCHOOL_ID.to_string()));

        context("replacement-admin.testnet", 5, None);
        contract.accept_admin(SCHOOL_ID.to_string());
        let school = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        assert_eq!(school.admin, replacement);
        assert_eq!(school.proposed_admin, None);
        assert_eq!(contract.admin_index.get(&account("school.testnet")), None);
        assert_eq!(contract.admin_index.get(&account("replacement-admin.testnet")), Some(SCHOOL_ID.to_string()));

        context("school.testnet", 6, None);
        let old_admin = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.create_invoice(SCHOOL_ID.to_string(), "abcdef0123456789abcdef0123456789".to_string(), U128(GROSS), 0);
        }));
        assert!(old_admin.is_err());
        context("replacement-admin.testnet", 7, None);
        contract.create_invoice(SCHOOL_ID.to_string(), "abcdef0123456789abcdef0123456789".to_string(), U128(GROSS), 0);
        assert_eq!(contract.invoices.get(&"abcdef0123456789abcdef0123456789".to_string()).unwrap().status, InvoiceStatus::Pending);
    }

    #[test]
    fn stuck_storage_withdrawal_finalization_never_recredits_a_possible_payout() {
        let (mut contract, _, _) = funded_contract();
        let amount = 250_000_000_000_000_000_000_000u128;
        let before = contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance;
        context("school.testnet", 4, None);
        let _promise = contract.withdraw_storage(SCHOOL_ID.to_string(), U128(amount));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance, before - amount);

        context("owner.testnet", 4 + WAIT_NS, None);
        contract.finalize_storage_withdrawal_as_sent(0, "explorer checked".to_string());
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance, before - amount);
        assert_eq!(contract.prepaid_storage_total, before - amount);

        context("registry.testnet", 4 + WAIT_NS + 1, Some(PromiseResult::Failed));
        assert!(!contract.on_storage_withdrawal_complete(0));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().storage_balance, before - amount);
    }

    #[test]
    fn pending_school_cannot_transfer_administration() {
        let (mut contract, _, _) = funded_contract();
        let mut school = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        school.status = SchoolStatus::PendingApproval;
        contract.schools.insert(&SCHOOL_ID.to_string(), &school);
        context("school.testnet", 4, None);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.propose_admin(SCHOOL_ID.to_string(), account("replacement-admin.testnet"));
        }));
        assert!(result.is_err());
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().proposed_admin, None);
        let withdrawal = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.withdraw_storage(SCHOOL_ID.to_string(), U128(1));
        }));
        assert!(withdrawal.is_err());
    }

    #[test]
    fn treasury_change_rechecks_registration_after_delay_and_ignores_stale_callbacks() {
        let (mut contract, _, _) = funded_contract();
        context("school.testnet", 4, None);
        let _cancelled_check = contract.queue_treasury_change(SCHOOL_ID.to_string(), account("new-treasury.testnet"));
        context("school.testnet", 5, None);
        contract.cancel_treasury_change(SCHOOL_ID.to_string());
        let storage_balance = StorageBalance { total: U128(1), available: U128(0) };
        let result = near_sdk::serde_json::to_vec(&Some(storage_balance)).unwrap();
        context("registry.testnet", 6, Some(PromiseResult::Successful(result.clone())));
        assert!(!contract.on_queue_treasury_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 1));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().queued_treasury, None);

        context("school.testnet", 7, None);
        let _failed_check = contract.queue_treasury_change(SCHOOL_ID.to_string(), account("new-treasury.testnet"));
        context("registry.testnet", 8, Some(PromiseResult::Failed));
        assert!(!contract.on_queue_treasury_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 3));
        let after_failure = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        assert_eq!(after_failure.queued_treasury, None);

        context("school.testnet", 9, None);
        let _queue = contract.queue_treasury_change(SCHOOL_ID.to_string(), account("new-treasury.testnet"));
        context("registry.testnet", 10, Some(PromiseResult::Successful(result.clone())));
        assert!(contract.on_queue_treasury_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 4));
        let queued = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        let effective = queued.treasury_effective_at.unwrap();
        assert_eq!(effective, 10 + TREASURY_DELAY_NS);

        context("school.testnet", effective - 1, None);
        let too_early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.apply_treasury_change(SCHOOL_ID.to_string());
        }));
        assert!(too_early.is_err());

        context("school.testnet", effective, None);
        let _apply = contract.apply_treasury_change(SCHOOL_ID.to_string());
        context("registry.testnet", effective + 1, Some(PromiseResult::Successful(result)));
        assert!(contract.on_apply_treasury_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 4));
        let changed = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        assert_eq!(changed.treasury, account("new-treasury.testnet"));
        assert_eq!(changed.queued_treasury, None);
        assert_eq!(contract.treasury_index.get(&account("treasury.testnet")), None);
        assert_eq!(contract.treasury_index.get(&account("new-treasury.testnet")), Some(SCHOOL_ID.to_string()));
        assert!(!contract.on_apply_treasury_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 1));
        assert_eq!(contract.schools.get(&SCHOOL_ID.to_string()).unwrap().treasury, account("new-treasury.testnet"));
    }

    #[test]
    fn only_one_treasury_change_can_be_pending_at_a_time() {
        let (mut contract, _, _) = funded_contract();
        context("school.testnet", 4, None);
        let _first = contract.queue_treasury_change(SCHOOL_ID.to_string(), account("new-treasury.testnet"));
        let second = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.queue_treasury_change(SCHOOL_ID.to_string(), account("another-treasury.testnet"));
        }));
        assert!(second.is_err());
        let school = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        assert_eq!(school.queued_treasury, Some(account("new-treasury.testnet")));
        assert_eq!(school.treasury_effective_at, None);
    }

    #[test]
    fn low_free_near_reserve_rejects_transfer_before_ledger_changes() {
        let (mut contract, _, _) = funded_contract();
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("registry.testnet"))
            .predecessor_account_id(account("anyone.testnet"))
            .block_timestamp(4)
            .account_balance(NearToken::from_yoctonear(MIN_FREE_NEAR_RESERVE / 2))
            .prepaid_gas(Gas::from_tgas(300))
            .attached_deposit(NearToken::from_yoctonear(0));
        testing_env!(builder.build());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.settle_invoice(INVOICE_ID.to_string());
        }));
        assert!(result.is_err());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::PaymentReceived);
        assert_eq!(contract.held, GROSS);
        assert_eq!(contract.settling_gross, 0);

        let mut low_gas = VMContextBuilder::new();
        low_gas
            .current_account_id(account("registry.testnet"))
            .predecessor_account_id(account("anyone.testnet"))
            .block_timestamp(5)
            .account_balance(NearToken::from_near(10))
            .prepaid_gas(Gas::from_tgas(50))
            .attached_deposit(NearToken::from_yoctonear(0));
        testing_env!(low_gas.build());
        let gas_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.settle_invoice(INVOICE_ID.to_string());
        }));
        assert!(gas_result.is_err());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::PaymentReceived);
        assert_eq!(contract.held, GROSS);
    }

    #[test]
    fn receiver_rejects_unknown_wrong_token_duplicate_and_suspended_school_payments() {
        let (mut contract, _, _) = funded_contract();
        const PENDING_ID: &str = "abcdef0123456789abcdef0123456789";
        context("school.testnet", 4, None);
        contract.create_invoice(SCHOOL_ID.to_string(), PENDING_ID.to_string(), U128(GROSS), 0);

        let snapshot_before = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        context("fake-token.testnet", 5, None);
        let wrong_token = contract.ft_on_transfer(account("parent-two.testnet"), U128(GROSS), PENDING_ID.to_string());
        assert!(matches!(wrong_token, PromiseOrValue::Value(value) if value.0 == GROSS));

        context("usdc.testnet", 6, None);
        let unknown = contract.ft_on_transfer(account("parent-two.testnet"), U128(GROSS), "unknown".to_string());
        assert!(matches!(unknown, PromiseOrValue::Value(value) if value.0 == GROSS));
        let duplicate = contract.ft_on_transfer(account("parent-two.testnet"), U128(GROSS), INVOICE_ID.to_string());
        assert!(matches!(duplicate, PromiseOrValue::Value(value) if value.0 == GROSS));
        let snapshot_after = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(snapshot_after.payer, snapshot_before.payer);
        assert_eq!(snapshot_after.treasury_snapshot, snapshot_before.treasury_snapshot);
        assert_eq!(snapshot_after.paid_at, snapshot_before.paid_at);
        assert_eq!(contract.held, GROSS);

        context("owner.testnet", 7, None);
        contract.suspend_school(SCHOOL_ID.to_string());
        context("usdc.testnet", 8, None);
        let suspended = contract.ft_on_transfer(account("parent-two.testnet"), U128(GROSS), PENDING_ID.to_string());
        assert!(matches!(suspended, PromiseOrValue::Value(value) if value.0 == GROSS));
        assert_eq!(contract.invoices.get(&PENDING_ID.to_string()).unwrap().status, InvoiceStatus::Pending);
        assert_eq!(contract.held, GROSS);
    }

    #[test]
    fn invoice_ids_remain_reserved_after_paid_cancelled_and_refunded_states() {
        let (mut contract, _, _) = funded_contract();
        const CANCELLED_ID: &str = "abcdef0123456789abcdef0123456789";
        const NEW_ID: &str = "fedcba9876543210fedcba9876543210";
        context("school.testnet", 4, None);
        contract.create_invoice(SCHOOL_ID.to_string(), CANCELLED_ID.to_string(), U128(GROSS), 0);
        contract.cancel_invoice(CANCELLED_ID.to_string());
        contract.create_invoice(SCHOOL_ID.to_string(), NEW_ID.to_string(), U128(GROSS), 0);

        let reuse_cancelled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.create_invoice(SCHOOL_ID.to_string(), CANCELLED_ID.to_string(), U128(GROSS), 0);
        }));
        assert!(reuse_cancelled.is_err());

        context("anyone.testnet", 5, None);
        let _settle = contract.settle_invoice(INVOICE_ID.to_string());
        context("registry.testnet", 6, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        context("school.testnet", 7, None);
        let reuse_paid = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.create_invoice(SCHOOL_ID.to_string(), INVOICE_ID.to_string(), U128(GROSS), 0);
        }));
        assert!(reuse_paid.is_err());

        context("usdc.testnet", 8, None);
        let accepted = contract.ft_on_transfer(account("parent-two.testnet"), U128(GROSS), NEW_ID.to_string());
        assert!(matches!(accepted, PromiseOrValue::Value(value) if value.0 == 0));
        assert_eq!(contract.invoices.get(&NEW_ID.to_string()).unwrap().status, InvoiceStatus::PaymentReceived);
        context("school.testnet", 9, None);
        assert_eq!(contract.invoices.get(&NEW_ID.to_string()).unwrap().status, InvoiceStatus::PaymentReceived);
        let _refund = contract.refund_payment(NEW_ID.to_string());
        context("registry.testnet", 10, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(NEW_ID.to_string(), 1, OperationType::Refund));
        context("school.testnet", 11, None);
        let reuse_refunded = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.create_invoice(SCHOOL_ID.to_string(), NEW_ID.to_string(), U128(GROSS), 0);
        }));
        assert!(reuse_refunded.is_err());
    }

    #[test]
    fn paid_invoice_snapshots_survive_fee_admin_and_treasury_changes() {
        let (mut contract, _, _) = funded_contract();
        let original = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();

        context("owner.testnet", 4, None);
        contract.set_school_fee(SCHOOL_ID.to_string(), 500);
        context("school.testnet", 5, None);
        let new_admin = account("replacement-admin.testnet");
        contract.propose_admin(SCHOOL_ID.to_string(), new_admin.clone());
        context("replacement-admin.testnet", 6, None);
        contract.accept_admin(SCHOOL_ID.to_string());

        context("replacement-admin.testnet", 7, None);
        let _queue = contract.queue_treasury_change(SCHOOL_ID.to_string(), account("new-treasury.testnet"));
        let storage_balance = StorageBalance { total: U128(1), available: U128(0) };
        let result = near_sdk::serde_json::to_vec(&Some(storage_balance)).unwrap();
        context("registry.testnet", 8, Some(PromiseResult::Successful(result.clone())));
        assert!(contract.on_queue_treasury_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 1));
        let effective = contract.schools.get(&SCHOOL_ID.to_string()).unwrap().treasury_effective_at.unwrap();

        context("replacement-admin.testnet", effective, None);
        let _apply = contract.apply_treasury_change(SCHOOL_ID.to_string());
        context("registry.testnet", effective + 1, Some(PromiseResult::Successful(result)));
        assert!(contract.on_apply_treasury_check(SCHOOL_ID.to_string(), account("new-treasury.testnet"), 1));

        context("anyone.testnet", effective + 2, None);
        let _settlement = contract.settle_invoice(INVOICE_ID.to_string());
        let settling = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(settling.operation_recipient, Some(account("treasury.testnet")));
        assert_eq!(settling.operation_amount, NET);
        context("registry.testnet", effective + 3, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));

        let paid = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        let school = contract.schools.get(&SCHOOL_ID.to_string()).unwrap();
        assert_eq!(school.admin, new_admin);
        assert_eq!(school.treasury, account("new-treasury.testnet"));
        assert_eq!(school.fee_bps, 500);
        assert_eq!(paid.status, InvoiceStatus::Paid);
        assert_eq!(paid.payer, original.payer);
        assert_eq!(paid.treasury_snapshot, original.treasury_snapshot);
        assert_eq!(paid.amount, original.amount);
        assert_eq!(paid.fee_bps, original.fee_bps);
        assert_eq!(paid.fee_amount, original.fee_amount);
        assert_eq!(paid.net_amount, original.net_amount);
        assert_eq!(paid.paid_at, original.paid_at);
        assert_eq!(contract.fees_available, FEE);
    }

    #[test]
    fn fee_rate_changes_apply_only_to_invoices_created_after_the_change() {
        let (mut contract, _, _) = funded_contract();
        context("owner.testnet", 4, None);
        contract.set_school_fee(SCHOOL_ID.to_string(), 500);
        context("school.testnet", 5, None);
        const NEW_ID: &str = "abcdef0123456789abcdef0123456789";
        contract.create_invoice(SCHOOL_ID.to_string(), NEW_ID.to_string(), U128(GROSS), 0);
        context("usdc.testnet", 6, None);
        let accepted = contract.ft_on_transfer(account("parent-two.testnet"), U128(GROSS), NEW_ID.to_string());
        assert!(matches!(accepted, PromiseOrValue::Value(value) if value.0 == 0));

        let old_invoice = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        let new_invoice = contract.invoices.get(&NEW_ID.to_string()).unwrap();
        assert_eq!(old_invoice.fee_bps, 100);
        assert_eq!(old_invoice.fee_amount, FEE);
        assert_eq!(new_invoice.fee_bps, 500);
        assert_eq!(new_invoice.fee_amount, 5_000_000);
        assert_eq!(new_invoice.net_amount, GROSS - 5_000_000);
    }

    #[test]
    fn pause_blocks_new_payments_and_settlement_but_allows_refund_and_cancellation() {
        let (mut contract, _, _) = funded_contract();
        const PENDING_ID: &str = "abcdef0123456789abcdef0123456789";
        const OTHER_PENDING_ID: &str = "fedcba9876543210fedcba9876543210";
        context("school.testnet", 4, None);
        contract.create_invoice(SCHOOL_ID.to_string(), PENDING_ID.to_string(), U128(GROSS), 0);
        contract.create_invoice(SCHOOL_ID.to_string(), OTHER_PENDING_ID.to_string(), U128(GROSS), 0);
        contract.platform_treasury = Some(account("platform-treasury.testnet"));
        contract.platform_treasury_verified = true;
        contract.fees_available = FEE;

        context("owner.testnet", 5, None);
        contract.pause();
        let settle = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.settle_invoice(INVOICE_ID.to_string());
        }));
        assert!(settle.is_err());
        let create = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.create_invoice(SCHOOL_ID.to_string(), "00112233445566778899aabbccddeeff".to_string(), U128(GROSS), 0);
        }));
        assert!(create.is_err());
        let withdraw = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.withdraw_fees(U128(FEE));
        }));
        assert!(withdraw.is_err());

        context("usdc.testnet", 6, None);
        let returned = contract.ft_on_transfer(account("parent-three.testnet"), U128(GROSS), PENDING_ID.to_string());
        assert!(matches!(returned, PromiseOrValue::Value(value) if value.0 == GROSS));
        assert_eq!(contract.invoices.get(&PENDING_ID.to_string()).unwrap().status, InvoiceStatus::Pending);

        context("school.testnet", 7, None);
        contract.cancel_invoice(OTHER_PENDING_ID.to_string());
        let _refund = contract.refund_payment(INVOICE_ID.to_string());
        assert_eq!(contract.invoices.get(&OTHER_PENDING_ID.to_string()).unwrap().status, InvoiceStatus::Cancelled);
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Refunding);
        context("registry.testnet", 8, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Refund));
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Refunded);
    }

    #[test]
    fn constructor_rejects_owner_or_token_aliasing_the_registry_account() {
        let mut builder = VMContextBuilder::new();
        builder.current_account_id(account("registry.testnet")).predecessor_account_id(account("owner.testnet"));
        testing_env!(builder.build());
        let owner_is_registry = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            Contract::new(account("registry.testnet"), account("usdc.testnet"));
        }));
        assert!(owner_is_registry.is_err());
        let token_is_registry = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            Contract::new(account("owner.testnet"), account("registry.testnet"));
        }));
        assert!(token_is_registry.is_err());
        let owner_is_token = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            Contract::new(account("usdc.testnet"), account("usdc.testnet"));
        }));
        assert!(owner_is_token.is_err());
    }

    #[test]
    fn fee_rounding_and_limits_are_exact() {
        assert_eq!(1u128 * DEFAULT_FEE_BPS as u128 / BPS, 0);
        assert_eq!(100u128 * DEFAULT_FEE_BPS as u128 / BPS, 1);
        assert_eq!(MAX_INVOICE, 1_000_000_000);
        assert_eq!(MAX_AT_RISK, 5_000_000_000);
        assert_eq!(MAX_LIFETIME_COLLATERAL, 1_000_000_000);
    }

    #[test]
    fn public_views_serialize_large_amounts_and_timestamps_as_decimal_strings() {
        let (mut contract, _, _) = funded_contract();
        let school = near_sdk::serde_json::to_value(contract.get_school(SCHOOL_ID.to_string()).unwrap()).unwrap();
        assert!(school["storage_balance"].is_string());
        assert!(school["created_at"].is_string());

        let invoice = near_sdk::serde_json::to_value(contract.get_invoice(INVOICE_ID.to_string()).unwrap()).unwrap();
        assert!(invoice["amount"].is_string());
        assert!(invoice["due_date"].is_string());
        assert!(invoice["paid_at"].is_string());
        assert!(invoice["fee_amount"].is_string());

        let accounting = near_sdk::serde_json::to_value(contract.get_accounting()).unwrap();
        assert!(accounting["held"].is_string());
        assert!(accounting["max_liability"].is_string());

        contract.fees_available = FEE;
        contract.platform_treasury = Some(account("platform-treasury.testnet"));
        contract.platform_treasury_verified = true;
        context("owner.testnet", 4, None);
        let _withdrawal = contract.withdraw_fees(U128(FEE));
        let withdrawal = near_sdk::serde_json::to_value(contract.get_withdrawal(0).unwrap()).unwrap();
        assert!(withdrawal["amount"].is_string());
        assert!(withdrawal["started_at"].is_string());
    }

    #[test]
    fn pagination_handles_u64_max_without_index_wraparound() {
        let (contract, _, _) = funded_contract();
        assert!(contract.get_schools(u64::MAX, 100).is_empty());
        assert!(contract.get_school_invoice_ids(SCHOOL_ID.to_string(), u64::MAX, 100).is_empty());
        assert!(contract.get_school_invoices(SCHOOL_ID.to_string(), u64::MAX, 100).is_empty());
    }

    #[test]
    fn invoice_ids_require_32_lowercase_hex_characters() {
        assert!(Contract::valid_invoice_id("0123456789abcdef0123456789abcdef"));
        assert!(!Contract::valid_invoice_id("ABCDEF0123456789ABCDEF0123456789"));
        assert!(!Contract::valid_invoice_id("short"));
        assert!(!Contract::valid_invoice_id("0123456789abcdef0123456789abcdeg"));
    }

    #[test]
    fn exact_payment_snapshots_payer_treasury_and_fee_once() {
        let (contract, _, _) = funded_contract();
        let invoice = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(invoice.status, InvoiceStatus::PaymentReceived);
        assert_eq!(invoice.amount, GROSS);
        assert_eq!(invoice.payer, Some(account("parent.testnet")));
        assert_eq!(invoice.treasury_snapshot, Some(account("treasury.testnet")));
        assert_eq!(invoice.fee_bps, DEFAULT_FEE_BPS);
        assert_eq!(invoice.fee_amount, FEE);
        assert_eq!(invoice.net_amount, NET);
        assert_eq!(invoice.paid_at, Some(3));
        assert_eq!(contract.held, GROSS);
    }

    #[test]
    fn successful_settlement_credits_only_the_snapshotted_fee() {
        let (mut contract, _, _) = funded_contract();
        context("anyone.testnet", 4, None);
        let _promise = contract.settle_invoice(INVOICE_ID.to_string());
        let settling = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(settling.status, InvoiceStatus::Settling);
        assert_eq!(settling.operation_recipient, Some(account("treasury.testnet")));
        assert_eq!(settling.operation_amount, NET);
        assert_eq!(settling.attempt_counter, 1);
        assert_eq!(contract.held, 0);
        assert_eq!(contract.settling_gross, GROSS);
        assert_eq!(contract.settling_fee, FEE);

        context("registry.testnet", 5, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        let paid = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(paid.status, InvoiceStatus::Paid);
        assert_eq!(paid.operation_type, None);
        assert_eq!(paid.active_attempt_id, None);
        assert_eq!(contract.settling_gross, 0);
        assert_eq!(contract.settling_fee, 0);
        assert_eq!(contract.fees_available, FEE);
    }

    #[test]
    fn failed_settlement_returns_to_payment_received_and_can_be_refunded() {
        let (mut contract, _, admin) = funded_contract();
        context("anyone.testnet", 4, None);
        let _promise = contract.settle_invoice(INVOICE_ID.to_string());
        context("registry.testnet", 5, Some(PromiseResult::Failed));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        let invoice = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(invoice.status, InvoiceStatus::PaymentReceived);
        assert_eq!(invoice.operation_type, None);
        assert_eq!(invoice.active_attempt_id, None);
        assert_eq!(contract.held, GROSS);
        assert_eq!(contract.settling_gross, 0);
        assert_eq!(contract.settling_fee, 0);

        context("school.testnet", 6, None);
        let _refund = contract.refund_payment(INVOICE_ID.to_string());
        let refunding = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(refunding.status, InvoiceStatus::Refunding);
        assert_eq!(refunding.operation_recipient, Some(account("parent.testnet")));
        assert_eq!(refunding.operation_amount, GROSS);
        assert_eq!(refunding.attempt_counter, 2);

        context("registry.testnet", 7, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 2, OperationType::Refund));
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Refunded);
        assert_eq!(contract.held, 0);
        assert_eq!(contract.refunding_gross, 0);
        assert_eq!(contract.fees_available, 0);
        let _ = admin;
    }

    #[test]
    fn callback_requires_exact_invoice_attempt_operation_and_status_and_is_single_use() {
        let (mut contract, _, _) = funded_contract();
        context("anyone.testnet", 4, None);
        let _promise = contract.settle_invoice(INVOICE_ID.to_string());
        context("registry.testnet", 5, Some(PromiseResult::Successful(vec![])));

        assert!(!contract.on_transfer_complete("ffffffffffffffffffffffffffffffff".to_string(), 1, OperationType::Settle));
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 2, OperationType::Settle));
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Refund));
        let mut invoice = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        invoice.status = InvoiceStatus::PaymentReceived;
        contract.invoices.insert(&INVOICE_ID.to_string(), &invoice);
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        invoice.status = InvoiceStatus::Settling;
        contract.invoices.insert(&INVOICE_ID.to_string(), &invoice);

        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Paid);
        assert_eq!(contract.fees_available, FEE);
        assert_eq!(contract.settling_gross, 0);
    }

    #[test]
    fn recovered_refund_can_only_restart_to_the_original_payer() {
        let (mut contract, _, _) = funded_contract();
        contract.fees_available = GROSS;
        context("school.testnet", 4, None);
        let _refund = contract.refund_payment(INVOICE_ID.to_string());

        context("owner.testnet", 4 + WAIT_NS, None);
        contract.retry_with_collateral(INVOICE_ID.to_string(), "refund callback missing".to_string());
        let recovered = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(recovered.status, InvoiceStatus::RefundRecovered);
        assert_eq!(recovered.operation_type, Some(OperationType::Refund));
        assert_eq!(recovered.operation_recipient, Some(account("parent.testnet")));
        assert_eq!(recovered.operation_amount, GROSS);
        assert_eq!(contract.fees_available, 0);
        assert_eq!(contract.lifetime_collateral, GROSS);

        context("school.testnet", 4 + 2 * WAIT_NS, None);
        let wrong_direction = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.refund_payment(INVOICE_ID.to_string());
        }));
        assert!(wrong_direction.is_err());
        let wrong_restart = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.restart_settlement(INVOICE_ID.to_string());
        }));
        assert!(wrong_restart.is_err());
        let cancel = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.cancel_invoice(INVOICE_ID.to_string());
        }));
        assert!(cancel.is_err());

        context("school.testnet", 4 + 2 * WAIT_NS, None);
        let _restart = contract.restart_refund(INVOICE_ID.to_string());
        let restarting = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(restarting.status, InvoiceStatus::Refunding);
        assert_eq!(restarting.operation_recipient, Some(account("parent.testnet")));
        assert_eq!(restarting.operation_amount, GROSS);
        assert_eq!(restarting.attempt_counter, 3);

        context("registry.testnet", 4 + 2 * WAIT_NS + 1, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 3, OperationType::Refund));
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Refunded);
        assert_eq!(contract.refunding_gross, 0);
        assert_eq!(contract.held, 0);
        assert_eq!(contract.lifetime_collateral, GROSS);
    }

    #[test]
    fn refunded_invoice_rejects_a_second_payment() {
        let (mut contract, _, _) = funded_contract();
        context("school.testnet", 4, None);
        let _refund = contract.refund_payment(INVOICE_ID.to_string());
        context("registry.testnet", 5, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Refund));
        context("usdc.testnet", 6, None);
        let returned = contract.ft_on_transfer(account("another-parent.testnet"), U128(GROSS), INVOICE_ID.to_string());
        assert!(matches!(returned, PromiseOrValue::Value(value) if value.0 == GROSS));
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Refunded);
        assert_eq!(contract.held, 0);
    }

    #[test]
    fn recovered_settlement_can_only_restart_as_settlement_or_close() {
        let (mut contract, owner, admin) = funded_contract();
        contract.fees_available = 200_000_000;
        context("anyone.testnet", 4, None);
        let _promise = contract.settle_invoice(INVOICE_ID.to_string());

        context("owner.testnet", 4 + WAIT_NS, None);
        contract.retry_with_collateral(INVOICE_ID.to_string(), "explorer checked".to_string());
        let recovered = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(recovered.status, InvoiceStatus::SettlementRecovered);
        context("registry.testnet", 4 + WAIT_NS + 1, Some(PromiseResult::Successful(vec![])));
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::SettlementRecovered);
        assert_eq!(recovered.recovery_count, 1);
        assert_eq!(recovered.attempt_counter, 2);
        assert_eq!(recovered.active_attempt_id, None);
        assert_eq!(contract.held, GROSS);
        assert_eq!(contract.fees_available, 200_000_000 - NET);
        assert_eq!(contract.lifetime_collateral, NET);

        context("school.testnet", 4 + 2 * WAIT_NS - 1, None);
        let too_early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.restart_settlement(INVOICE_ID.to_string())
        }));
        assert!(too_early.is_err());
        context("school.testnet", 4 + 2 * WAIT_NS, None);
        let _restart = contract.restart_settlement(INVOICE_ID.to_string());
        let restarted = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(restarted.status, InvoiceStatus::Settling);
        assert_eq!(restarted.attempt_counter, 3);
        assert_eq!(restarted.operation_recipient, Some(account("treasury.testnet")));

        context("registry.testnet", 4 + 2 * WAIT_NS + 1, Some(PromiseResult::Failed));
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 2, OperationType::Settle));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 3, OperationType::Settle));
        let failed_restart = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(failed_restart.status, InvoiceStatus::SettlementRecovered);
        assert_eq!(failed_restart.operation_type, Some(OperationType::Settle));
        assert_eq!(failed_restart.recovery_count, 1);
        assert_eq!(failed_restart.attempt_counter, 3);
        assert_eq!(contract.held, GROSS);

        context("owner.testnet", 4 + 3 * WAIT_NS + 2, None);
        contract.close_as_sent(INVOICE_ID.to_string(), "verified payout outcome".to_string());
        let closed = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(closed.status, InvoiceStatus::Paid);
        assert_eq!(closed.operation_type, None);
        assert_eq!(closed.active_attempt_id, None);
        assert_eq!(closed.attempt_counter, 4);
        assert_eq!(contract.held, 0);
        assert_eq!(owner, account("owner.testnet"));
        assert_eq!(admin, account("school.testnet"));
    }

    #[test]
    fn lifetime_collateral_cap_allows_exact_limit_but_never_exceeds_it() {
        let (mut contract, _, _) = funded_contract();
        let mut invoice = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        invoice.amount = 1;
        invoice.fee_amount = 0;
        invoice.net_amount = 1;
        invoice.status = InvoiceStatus::Settling;
        invoice.attempt_counter = 1;
        invoice.active_attempt_id = Some(1);
        invoice.operation_type = Some(OperationType::Settle);
        invoice.operation_recipient = Some(account("treasury.testnet"));
        invoice.operation_amount = 1;
        invoice.operation_started_at = Some(1);
        invoice.operation_from_recovered = false;
        contract.invoices.insert(&INVOICE_ID.to_string(), &invoice);
        contract.held = 0;
        contract.settling_gross = 1;
        contract.settling_fee = 0;
        contract.lifetime_collateral = MAX_LIFETIME_COLLATERAL - 1;
        contract.fees_available = 2;

        context("owner.testnet", 1 + WAIT_NS, None);
        contract.retry_with_collateral(INVOICE_ID.to_string(), "exact cap".to_string());
        assert_eq!(contract.lifetime_collateral, MAX_LIFETIME_COLLATERAL);
        assert_eq!(contract.fees_available, 1);
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::SettlementRecovered);

        context("school.testnet", 1 + 2 * WAIT_NS, None);
        let _restart = contract.restart_settlement(INVOICE_ID.to_string());
        context("owner.testnet", 1 + 3 * WAIT_NS, None);
        let over_cap = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.retry_with_collateral(INVOICE_ID.to_string(), "over cap".to_string());
        }));
        assert!(over_cap.is_err());
        assert_eq!(contract.lifetime_collateral, MAX_LIFETIME_COLLATERAL);
        assert_eq!(contract.fees_available, 1);
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Settling);
    }

    #[test]
    fn an_invoice_can_use_at_most_two_collateral_recoveries() {
        let (mut contract, _, _) = funded_contract();
        contract.fees_available = 2 * NET;
        context("anyone.testnet", 4, None);
        let _first = contract.settle_invoice(INVOICE_ID.to_string());

        context("owner.testnet", 4 + WAIT_NS, None);
        contract.retry_with_collateral(INVOICE_ID.to_string(), "first recovery".to_string());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().recovery_count, 1);

        context("school.testnet", 4 + 2 * WAIT_NS, None);
        let _restart_one = contract.restart_settlement(INVOICE_ID.to_string());
        context("registry.testnet", 4 + 2 * WAIT_NS + 1, Some(PromiseResult::Failed));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 3, OperationType::Settle));

        context("school.testnet", 4 + 3 * WAIT_NS + 1, None);
        let _restart_two = contract.restart_settlement(INVOICE_ID.to_string());

        context("owner.testnet", 4 + 4 * WAIT_NS + 1, None);
        contract.retry_with_collateral(INVOICE_ID.to_string(), "second recovery".to_string());
        let second_recovery = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(second_recovery.recovery_count, 2);
        assert_eq!(second_recovery.attempt_counter, 5);
        assert_eq!(contract.lifetime_collateral, 2 * NET);
        assert_eq!(contract.fees_available, 0);

        context("school.testnet", 4 + 5 * WAIT_NS + 1, None);
        let _restart_three = contract.restart_settlement(INVOICE_ID.to_string());
        let third_frozen = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(third_frozen.status, InvoiceStatus::Settling);
        assert_eq!(third_frozen.attempt_counter, 6);

        context("owner.testnet", 4 + 6 * WAIT_NS + 1, None);
        let third_recovery = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.retry_with_collateral(INVOICE_ID.to_string(), "must be rejected".to_string());
        }));
        assert!(third_recovery.is_err());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().recovery_count, 2);
        contract.close_as_sent(INVOICE_ID.to_string(), "third recovery not allowed".to_string());
        let closed = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(closed.status, InvoiceStatus::Paid);
        assert_eq!(closed.attempt_counter, 7);
        assert_eq!(contract.lifetime_collateral, 2 * NET);
    }

    #[test]
    fn collateral_recovery_and_close_are_owner_only_and_use_platform_fees() {
        let (mut contract, _, _) = funded_contract();
        context("anyone.testnet", 4, None);
        let _promise = contract.settle_invoice(INVOICE_ID.to_string());
        contract.fees_available = NET - 1;

        context("school.testnet", 4 + WAIT_NS, None);
        let unauthorized_retry = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.retry_with_collateral(INVOICE_ID.to_string(), "not owner".to_string());
        }));
        assert!(unauthorized_retry.is_err());
        let unauthorized_close = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.close_as_sent(INVOICE_ID.to_string(), "not owner".to_string());
        }));
        assert!(unauthorized_close.is_err());

        context("owner.testnet", 4 + WAIT_NS, None);
        let insufficient = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.retry_with_collateral(INVOICE_ID.to_string(), "insufficient fee pool".to_string());
        }));
        assert!(insufficient.is_err());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Settling);
        assert_eq!(contract.held, 0);
        assert_eq!(contract.fees_available, NET - 1);
        assert_eq!(contract.lifetime_collateral, 0);

        contract.fees_available = NET;
        contract.retry_with_collateral(INVOICE_ID.to_string(), "platform fee collateral".to_string());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::SettlementRecovered);
        assert_eq!(contract.held, GROSS);
        assert_eq!(contract.fees_available, 0);
        assert_eq!(contract.lifetime_collateral, NET);

        context("school.testnet", 4 + 2 * WAIT_NS, None);
        let unauthorized_recovered_close = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.close_as_sent(INVOICE_ID.to_string(), "not owner".to_string());
        }));
        assert!(unauthorized_recovered_close.is_err());
        context("owner.testnet", 4 + 2 * WAIT_NS, None);
        contract.close_as_sent(INVOICE_ID.to_string(), "owner verified".to_string());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Paid);
    }

    #[test]
    fn close_as_sent_handles_frozen_and_recovered_refunds_without_releasing_school_funds() {
        let (mut frozen, _, _) = funded_contract();
        context("school.testnet", 4, None);
        let _refund = frozen.refund_payment(INVOICE_ID.to_string());
        context("owner.testnet", 4 + WAIT_NS, None);
        frozen.close_as_sent(INVOICE_ID.to_string(), "refund receipt checked".to_string());
        let closed_frozen = frozen.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(closed_frozen.status, InvoiceStatus::Refunded);
        assert_eq!(closed_frozen.attempt_counter, 2);
        assert_eq!(closed_frozen.active_attempt_id, None);
        assert_eq!(closed_frozen.operation_type, None);
        assert_eq!(frozen.refunding_gross, 0);
        context("registry.testnet", 4 + WAIT_NS + 1, Some(PromiseResult::Successful(vec![])));
        assert!(!frozen.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Refund));

        let (mut recovered, _, _) = funded_contract();
        recovered.fees_available = GROSS;
        context("school.testnet", 4, None);
        let _refund_again = recovered.refund_payment(INVOICE_ID.to_string());
        context("owner.testnet", 4 + WAIT_NS, None);
        recovered.retry_with_collateral(INVOICE_ID.to_string(), "refund collateral".to_string());
        assert_eq!(recovered.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::RefundRecovered);
        recovered.close_as_sent(INVOICE_ID.to_string(), "recovered refund receipt checked".to_string());
        let closed_recovered = recovered.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(closed_recovered.status, InvoiceStatus::Refunded);
        assert_eq!(closed_recovered.attempt_counter, 3);
        assert_eq!(closed_recovered.active_attempt_id, None);
        assert_eq!(closed_recovered.operation_type, None);
        assert_eq!(recovered.held, 0);
        assert_eq!(recovered.refunding_gross, 0);
        assert_eq!(recovered.lifetime_collateral, GROSS);
    }

    #[test]
    fn disabling_collateral_recovery_keeps_frozen_invoice_closeable() {
        let (mut contract, _, _) = funded_contract();
        context("anyone.testnet", 4, None);
        let _promise = contract.settle_invoice(INVOICE_ID.to_string());
        contract.allow_retry = false;
        context("owner.testnet", 4 + WAIT_NS, None);
        let retry = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.retry_with_collateral(INVOICE_ID.to_string(), "disabled".to_string());
        }));
        assert!(retry.is_err());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Settling);
        contract.close_as_sent(INVOICE_ID.to_string(), "explorer verified".to_string());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::Paid);
    }

    #[test]
    fn school_admin_cannot_cancel_another_schools_invoice() {
        let (mut contract, _, _) = funded_contract();
        let other_admin = account("other-school.testnet");
        let other_school = School {
            school_id: "00000000000000000000000000000002".to_string(),
            name: "Other School".to_string(),
            description: "Isolation fixture".to_string(),
            admin: other_admin.clone(),
            treasury: account("other-treasury.testnet"),
            status: SchoolStatus::Active,
            treasury_verified: true,
            fee_bps: DEFAULT_FEE_BPS,
            storage_balance: 1_000_000_000_000_000_000_000_000,
            registration_storage_cost: 0,
            created_at: 1,
            queued_treasury: None,
            treasury_effective_at: None,
            proposed_admin: None,
            approval_pending: false,
            approval_started_at: None,
            approval_nonce: 0,
            treasury_change_nonce: 0,
            reactivation_pending: false,
            reactivation_started_at: None,
            reactivation_nonce: 0,
        };
        contract.schools.insert(&other_school.school_id, &other_school);
        contract.admin_index.insert(&other_admin, &other_school.school_id);
        contract.treasury_index.insert(&other_school.treasury, &other_school.school_id);
        contract.prepaid_storage_total += other_school.storage_balance;
        context("other-school.testnet", 4, None);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.cancel_invoice(INVOICE_ID.to_string());
        }));
        assert!(result.is_err());
        assert_eq!(contract.invoices.get(&INVOICE_ID.to_string()).unwrap().status, InvoiceStatus::PaymentReceived);
    }

    #[test]
    fn fee_withdrawal_uses_only_available_fees_and_restores_confirmed_failures() {
        let (mut contract, owner, _) = funded_contract();
        context("anyone.testnet", 4, None);
        let _settlement = contract.settle_invoice(INVOICE_ID.to_string());
        context("registry.testnet", 5, Some(PromiseResult::Successful(vec![])));
        assert!(contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        assert_eq!(contract.fees_available, FEE);

        contract.platform_treasury = Some(account("platform-treasury.testnet"));
        contract.platform_treasury_verified = true;
        context("owner.testnet", 6, None);
        let _withdrawal = contract.withdraw_fees(U128(FEE));
        assert_eq!(contract.fees_available, 0);
        assert_eq!(contract.fees_in_flight, FEE);

        context("registry.testnet", 7, Some(PromiseResult::Failed));
        assert!(contract.on_fee_withdrawal_complete(0));
        assert_eq!(contract.fees_in_flight, 0);
        assert_eq!(contract.fees_available, FEE);
        assert_eq!(owner, account("owner.testnet"));
    }

    #[test]
    fn underpayment_overpayment_and_at_risk_cap_are_refunded_in_full() {
        let (mut contract, _, admin) = funded_contract();
        const SECOND_ID: &str = "fedcba9876543210fedcba9876543210";
        context("school.testnet", 4, None);
        contract.create_invoice(SCHOOL_ID.to_string(), SECOND_ID.to_string(), U128(GROSS), 0);

        context("usdc.testnet", 5, None);
        let under = contract.ft_on_transfer(account("parent.testnet"), U128(GROSS - 1), SECOND_ID.to_string());
        assert!(matches!(under, PromiseOrValue::Value(value) if value.0 == GROSS - 1));
        let over = contract.ft_on_transfer(account("parent.testnet"), U128(GROSS + 1), SECOND_ID.to_string());
        assert!(matches!(over, PromiseOrValue::Value(value) if value.0 == GROSS + 1));
        assert_eq!(contract.invoices.get(&SECOND_ID.to_string()).unwrap().status, InvoiceStatus::Pending);

        contract.held = MAX_AT_RISK;
        let capped = contract.ft_on_transfer(account("parent.testnet"), U128(GROSS), SECOND_ID.to_string());
        assert!(matches!(capped, PromiseOrValue::Value(value) if value.0 == GROSS));
        assert_eq!(contract.invoices.get(&SECOND_ID.to_string()).unwrap().status, InvoiceStatus::Pending);
        assert_eq!(contract.held, MAX_AT_RISK);
        assert_eq!(admin, account("school.testnet"));
    }

    #[test]
    fn stale_callback_cannot_change_a_closed_invoice() {
        let (mut contract, _, _) = funded_contract();
        context("anyone.testnet", 4, None);
        let _promise = contract.settle_invoice(INVOICE_ID.to_string());
        context("owner.testnet", 4 + WAIT_NS, None);
        contract.close_as_sent(INVOICE_ID.to_string(), "explorer confirms transfer".to_string());
        let before = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        context("registry.testnet", 5 + WAIT_NS, Some(PromiseResult::Successful(vec![])));
        assert!(!contract.on_transfer_complete(INVOICE_ID.to_string(), 1, OperationType::Settle));
        let after = contract.invoices.get(&INVOICE_ID.to_string()).unwrap();
        assert_eq!(after.status, before.status);
        assert_eq!(after.attempt_counter, before.attempt_counter);
        assert_eq!(contract.fees_available, before.fee_amount);
    }
}
