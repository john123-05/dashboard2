import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  created: number;
  metadata: Record<string, string>;
}

interface StripeListResponse {
  data: StripeCustomer[];
  has_more: boolean;
}

Deno.serve(async (req: Request) => {
  console.log("stripe-customers invoked", {
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

    const url = new URL(req.url);
    const limit = url.searchParams.get("limit") || "100";

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/customers?limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!stripeResponse.ok) {
      const error = await stripeResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch Stripe customers", details: error }),
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

    const customers = data.data.map((customer) => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      created_at: new Date(customer.created * 1000).toISOString(),
      metadata: customer.metadata,
    }));

    return new Response(
      JSON.stringify({ customers }),
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
