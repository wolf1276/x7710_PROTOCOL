#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Symbol,
};

// Import the contract clients
mod account_registry {
    soroban_sdk::contractimport!(
        file = "../target/wasm32v1-none/release/account_registry.wasm"
    );
}

mod policy_engine {
    soroban_sdk::contractimport!(
        file = "../target/wasm32v1-none/release/policy_engine.wasm"
    );
}

// This is the request structure passed by the relay
#[contracttype]
#[derive(Clone)]
pub struct ActionRequest {
    pub owner: Address,
    pub agent: Address,
    pub destination: Address,
    pub asset_contract: Address,  // The SEP-41 token contract
    pub amount: i128,             // In stroops
}

#[contract]
pub struct ExecutionRouter;

#[contractimpl]
impl ExecutionRouter {
    pub fn execute_action(
        env: Env,
        registry_contract: Address,
        request: ActionRequest,
    ) -> bool {
        // Step 0: Validate request structure
        assert!(request.amount > 0, "AmountMustBePositive");

        // Step 1: Verify the owner is authorizing this action
        request.owner.require_auth();

        // Step 2: Get the registry client and verify agent is authorized
        let registry = account_registry::Client::new(&env, &registry_contract);

        let is_authorized = registry.is_authorized_agent(
            &request.owner,
            &request.agent,
        );
        assert!(is_authorized, "AgentNotAuthorized");

        // Emit event so the relay can observe this step
        env.events().publish(
            (Symbol::new(&env, "AgentVerified"),),
            (&request.agent, &request.owner),
        );

        // Step 3: Get the policy contract address and validate the action
        let policy_contract_addr = registry.get_policy_contract(&request.owner);
        let policy = policy_engine::Client::new(&env, &policy_contract_addr);

        // Derive the asset symbol from the asset contract ID
        let asset_symbol = Symbol::new(&env, "USDC"); // TODO: parameterize this

        // Call validate_action on the policy engine
        let approved = policy.validate_action(
            &request.owner,
            &request.agent,
            &asset_symbol,
            &request.amount,
        );
        assert!(approved, "PolicyRejectedAction");

        // Step 4: Execute the token transfer atomically
        let token_client = token::Client::new(&env, &request.asset_contract);

        token_client.transfer(
            &request.owner,        // from
            &request.destination,  // to
            &request.amount,       // amount in stroops
        );

        // Step 5: Emit the final audit event
        env.events().publish(
            (Symbol::new(&env, "ActionExecuted"),),
            (
                &request.agent,
                &request.owner,
                &request.destination,
                request.amount,
                env.ledger().sequence(),
            ),
        );

        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Vec, testutils::{Address as AddressTestUtils}};

    #[test]
    fn test_execute_action_full_flow() {
        let env = Env::default();
        env.mock_all_auths();

        // 1. Deploy account_registry and policy_engine from WASM files
        let registry_id = env.register_contract_wasm(None, account_registry::WASM);
        let policy_id = env.register_contract_wasm(None, policy_engine::WASM);

        // 2. Deploy execution_router
        let router_id = env.register_contract(None, ExecutionRouter);

        let owner = Address::generate(&env);
        let agent = Address::generate(&env);
        let destination = Address::generate(&env);

        // Register the account in registry
        let registry = account_registry::Client::new(&env, &registry_id);
        let agents = Vec::from_array(&env, [agent.clone()]);
        registry.register_account(&owner, &policy_id, &agents);

        // Set a policy
        let policy = policy_engine::Client::new(&env, &policy_id);
        let config = policy_engine::PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128, // 1000 USDC
            max_daily_spend: 50_000_000_000i128,      // 5000 USDC
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: Vec::from_array(&env, [Symbol::new(&env, "USDC")]),
            expiry_ledger: 1_000_000,
        };
        policy.set_policy(&owner, &config);

        // Create a mock token contract
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract(token_admin);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);
        
        // Mint enough tokens to the owner so transfer succeeds
        token_admin_client.mint(&owner, &10_000_000_000i128);

        // Execute an action
        let router = ExecutionRouterClient::new(&env, &router_id);
        let request = ActionRequest {
            owner: owner.clone(),
            agent: agent.clone(),
            destination: destination.clone(),
            asset_contract: token_contract,
            amount: 5_000_000_000i128,  // 500 USDC
        };

        let result = router.execute_action(&registry_id, &request);
        assert!(result);
    }

    #[test]
    #[should_panic(expected = "AgentNotAuthorized")]
    fn test_execute_action_unauthorized_agent() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract_wasm(None, account_registry::WASM);
        let policy_id = env.register_contract_wasm(None, policy_engine::WASM);
        let router_id = env.register_contract(None, ExecutionRouter);

        let owner = Address::generate(&env);
        let authorized_agent = Address::generate(&env);
        let unauthorized_agent = Address::generate(&env);
        let destination = Address::generate(&env);

        let registry = account_registry::Client::new(&env, &registry_id);
        let agents = Vec::from_array(&env, [authorized_agent]);
        registry.register_account(&owner, &policy_id, &agents);

        let token_contract = Address::generate(&env);

        let router = ExecutionRouterClient::new(&env, &router_id);
        let request = ActionRequest {
            owner: owner.clone(),
            agent: unauthorized_agent,  // Not authorized
            destination,
            asset_contract: token_contract,
            amount: 5_000_000_000i128,
        };

        router.execute_action(&registry_id, &request);
    }

    #[test]
    #[should_panic(expected = "PolicyRejectedAction")]
    fn test_execute_action_policy_rejects_over_limit() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract_wasm(None, account_registry::WASM);
        let policy_id = env.register_contract_wasm(None, policy_engine::WASM);
        let router_id = env.register_contract(None, ExecutionRouter);

        let owner = Address::generate(&env);
        let agent = Address::generate(&env);
        let destination = Address::generate(&env);

        let registry = account_registry::Client::new(&env, &registry_id);
        let agents = Vec::from_array(&env, [agent.clone()]);
        registry.register_account(&owner, &policy_id, &agents);

        let policy = policy_engine::Client::new(&env, &policy_id);
        let config = policy_engine::PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,  // 1000 USDC max
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: Vec::from_array(&env, [Symbol::new(&env, "USDC")]),
            expiry_ledger: 1_000_000,
        };
        policy.set_policy(&owner, &config);

        let token_contract = Address::generate(&env);

        let router = ExecutionRouterClient::new(&env, &router_id);
        let request = ActionRequest {
            owner: owner.clone(),
            agent: agent.clone(),
            destination,
            asset_contract: token_contract,
            amount: 20_000_000_000i128,  // 2000 USDC — exceeds limit
        };

        router.execute_action(&registry_id, &request);
    }
}
