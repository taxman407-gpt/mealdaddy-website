// Trusted-server repository for the weekly Stripe trial promotion.
// Instantiate with a Supabase service-role client; never import this file in browser code.

export class SupabaseTrialRepository {
  constructor({ supabase }) {
    if (!supabase) throw new Error("A Supabase server client is required.");
    this.supabase = supabase;
  }

  async getWeeklyTrialCount(weekStart) {
    const { count, error } = await this.supabase
      .from("subscription_trial_reservations")
      .select("id", { count: "exact", head: true })
      .eq("week_start", weekStart)
      .in("status", ["reserved", "granted"]);
    if (error) throw error;
    return count ?? 0;
  }

  async reserveWeeklyTrial({ userId, weekStart, weeklyLimit }) {
    const { data, error } = await this.supabase.rpc(
      "reserve_weekly_subscription_trial",
      {
        requested_user_id: userId,
        requested_week_start: weekStart,
        requested_weekly_limit: weeklyLimit
      }
    );
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("Trial reservation returned no result.");
    return {
      eligible: result.eligible,
      reservationId: result.reservation_id,
      usedCount: Number(result.used_count)
    };
  }

  async attachCheckoutSession(reservationId, checkoutSessionId) {
    const { error } = await this.supabase
      .from("subscription_trial_reservations")
      .update({ stripe_checkout_session_id: checkoutSessionId, updated_at: new Date().toISOString() })
      .eq("id", reservationId)
      .eq("status", "reserved");
    if (error) throw error;
  }

  async markTrialGranted(checkoutSessionId) {
    const { error } = await this.supabase
      .from("subscription_trial_reservations")
      .update({ status: "granted", updated_at: new Date().toISOString() })
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .eq("status", "reserved");
    if (error) throw error;
    return { granted: true };
  }

  async releaseTrialReservation(checkoutSessionId) {
    const { error } = await this.supabase
      .from("subscription_trial_reservations")
      .update({ status: "released", updated_at: new Date().toISOString() })
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .eq("status", "reserved");
    if (error) throw error;
    return { released: true };
  }

  async releaseTrialReservationById(reservationId) {
    const { error } = await this.supabase
      .from("subscription_trial_reservations")
      .update({ status: "released", updated_at: new Date().toISOString() })
      .eq("id", reservationId)
      .eq("status", "reserved");
    if (error) throw error;
    return { released: true };
  }
}
