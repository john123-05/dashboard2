import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isStaffCaller, staffForbidden } from "../_shared/blockStaff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  paid: boolean;
}

interface StripeListResponse {
  data: StripeCharge[];
  has_more: boolean;
}

Deno.serve(async (req: Request) => {
  console.log("stripe-revenue invoked", {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers),
  });

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (await isStaffCaller(req)) return staffForbidden();

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/charges?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!stripeResponse.ok) {
      const error = await stripeResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch Stripe charges", details: error }),
        {
          status: stripeResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data: StripeListResponse = await stripeResponse.json();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dailyRevenue = new Map<string, number>();
    let totalRevenue = 0;
    let monthlyRevenue = 0;

    data.data.forEach((charge) => {
      if (charge.paid && charge.status === 'succeeded') {
        const chargeDate = new Date(charge.created * 1000);
        const dateKey = chargeDate.toISOString().split('T')[0];
        const amount = charge.amount / 100;

        dailyRevenue.set(dateKey, (dailyRevenue.get(dateKey) || 0) + amount);
        totalRevenue += amount;

        if (chargeDate >= thirtyDaysAgo) {
          monthlyRevenue += amount;
        }
      }
    });

    const revenueByDay = Array.from(dailyRevenue.entries())
      .map(([date, amount]) => ({
        date,
        amount: parseFloat(amount.toFixed(2)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return new Response(
      JSON.stringify({
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        monthly_revenue: parseFloat(monthlyRevenue.toFixed(2)),
        revenue_by_day: revenueByDay,
        currency: data.data[0]?.currency?.toUpperCase() || 'USD',
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
