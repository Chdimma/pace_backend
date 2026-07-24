use anchor_lang::prelude::*;

declare_id!("PaceContract1111111111111111111111111111111"); // Replace with your actual deploy program ID

#[program]
pub mod pace_health {
    use super::*;

    // Initializes a user's health ledger PDA
    pub fn initialize_user_ledger(ctx: Context<InitializeLedger>) -> Result<()> {
        let ledger = &mut ctx.accounts.user_ledger;
        ledger.authority = ctx.accounts.user.key();
        ledger.event_count = 0;
        Ok(())
    }

    // Appends a new posture or health event
    pub fn log_health_event(
        ctx: Context<LogHealthEvent>,
        event_type: String,
        posture_score: u8,
        duration_secs: u64,
    ) -> Result<()> {
        let ledger = &mut ctx.accounts.user_ledger;
        let clock = Clock::get()?;

        let new_event = HealthEvent {
            event_type,
            posture_score,
            duration_secs,
            timestamp: clock.unix_timestamp,
        };

        ledger.history.push(new_event);
        ledger.event_count += 1;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeLedger<'info> {
    // PDA derived using the string "pace-ledger" and the user's public key
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 4 + (100 * 40), // Allocating space for authority, count, and ~100 logs
        seeds = [b"pace-ledger", user.key().as_ref()],
        bump
    )]
    pub user_ledger: Account<'info, UserLedger>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LogHealthEvent<'info> {
    #[account(
        mut,
        seeds = [b"pace-ledger", user.key().as_ref()],
        bump,
        has_one = authority
    )]
    pub user_ledger: Account<'info, UserLedger>,
    pub authority: Signer<'info>, // In your MVP, the backend will sign as authority on behalf of auto-generated users
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
pub struct UserLedger {
    pub authority: Pubkey,
    pub event_count: u32,
    pub history: Vec<HealthEvent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct HealthEvent {
    pub event_type: String, // e.g., "posture_correction"
    pub posture_score: u8,   // 0 - 100
    pub duration_secs: u64,
    pub timestamp: i64,      // Clock block timestamp
}