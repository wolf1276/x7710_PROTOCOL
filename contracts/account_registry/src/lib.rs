#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol, Vec,
};

// Storage keys — must be stable across upgrades
#[contracttype]
pub enum DataKey {
    Owner(Address),        // Points to AccountConfig
    AgentList(Address),    // Points to Vec<Address> of authorized agents
}

// The complete account configuration structure
#[contracttype]
#[derive(Clone)]
pub struct AccountConfig {
    pub owner: Address,
    pub policy_contract: Address,  // Cross-contract reference
    pub created_ledger: u32,
    pub active: bool,
}

#[contract]
pub struct AccountRegistry;

#[contractimpl]
impl AccountRegistry {
    pub fn register_account(
        env: Env,
        owner: Address,
        policy_contract: Address,
        authorized_agents: Vec<Address>,
    ) -> AccountConfig {
        // SECURITY: Authorization check MUST be first line before any writes
        owner.require_auth();

        // Reject if agents list is empty — accounts with no agents are pointless
        assert!(authorized_agents.len() > 0, "NoAgentsAuthorized");

        let config = AccountConfig {
            owner: owner.clone(),
            policy_contract: policy_contract.clone(),
            created_ledger: env.ledger().sequence(),
            active: true,
        };

        // Write to persistent storage — this outlives the transaction
        env.storage()
            .persistent()
            .set(&DataKey::Owner(owner.clone()), &config);

        // Store the agent list separately for efficient lookups
        env.storage()
            .persistent()
            .set(&DataKey::AgentList(owner.clone()), &authorized_agents);

        // Emit event for off-chain indexing
        env.events().publish(
            (Symbol::new(&env, "AccountRegistered"),),
            (owner, policy_contract, authorized_agents.len()),
        );

        config
    }

    pub fn is_authorized_agent(
        env: Env,
        owner: Address,
        agent: Address,
    ) -> bool {
        // Retrieve the agent list; default to empty if not found
        let agents: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::AgentList(owner.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        // Return true only if the agent is in the list
        agents.contains(&agent)
    }

    pub fn get_policy_contract(
        env: Env,
        owner: Address,
    ) -> Address {
        let config: AccountConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(owner))
            .expect("AccountNotRegistered");

        config.policy_contract
    }

    pub fn list_agents(
        env: Env,
        owner: Address,
    ) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::AgentList(owner))
            .unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{vec, testutils::Address as AddressTestUtils};

    #[test]
    fn test_register_account_success() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);
        let agent_1 = Address::generate(&env);
        let agent_2 = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistryClient::new(&env, &contract_id);

        env.mock_all_auths();
        let agents = vec![&env, agent_1.clone(), agent_2.clone()];

        let config = registry.register_account(&owner, &policy, &agents);

        assert_eq!(config.owner, owner);
        assert_eq!(config.policy_contract, policy);
        assert_eq!(config.active, true);
    }

    #[test]
    #[should_panic(expected = "NoAgentsAuthorized")]
    fn test_register_empty_agents_rejected() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistryClient::new(&env, &contract_id);

        env.mock_all_auths();
        let agents: Vec<Address> = Vec::new(&env);

        registry.register_account(&owner, &policy, &agents);
    }

    #[test]
    fn test_is_authorized_agent() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);
        let agent_1 = Address::generate(&env);
        let agent_2 = Address::generate(&env);  // Not registered

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistryClient::new(&env, &contract_id);

        env.mock_all_auths();
        let agents = vec![&env, agent_1.clone()];
        registry.register_account(&owner, &policy, &agents);

        assert!(registry.is_authorized_agent(&owner, &agent_1));
        assert!(!registry.is_authorized_agent(&owner, &agent_2));
    }

    #[test]
    fn test_get_policy_contract() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistryClient::new(&env, &contract_id);

        env.mock_all_auths();
        let agents = vec![&env, agent];
        registry.register_account(&owner, &policy, &agents);

        assert_eq!(registry.get_policy_contract(&owner), policy);
    }

    #[test]
    #[should_panic(expected = "AccountNotRegistered")]
    fn test_get_policy_contract_unknown_owner() {
        let env = Env::default();
        let unknown_owner = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistryClient::new(&env, &contract_id);

        registry.get_policy_contract(&unknown_owner);
    }
}
