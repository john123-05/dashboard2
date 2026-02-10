import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  customer: string | null;
  description: string | null;
  metadata: Record<string, string>;
  charges: {
    data: Array<{
      receipt_email: string | null;
      billing_details: {
        email: string | null;
        name: string | null;
      };
    }>;
  };
}

interface StripeListResponse {
  data: StripePaymentIntent[];
  has_more: boolean;
}

Deno.serve(async (req: Request) => {
  console.log("stripe-payments invoked", {
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
      `https://api.stripe.com/v1/payment_intents?limit=${limit}&expand[]=data.charges`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!stripeResponse.ok) {
      const error = await stripeResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch Stripe payments", details: error }),
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

    const payments = data.data.map((payment) => {
      const charge = payment.charges?.data?.[0];
      const email = charge?.receipt_email || charge?.billing_details?.email || null;
      const customerName = charge?.billing_details?.name || null;

      return {
        id: payment.id,
        amount: payment.amount / 100,
        currency: payment.currency.toUpperCase(),
        status: payment.status,
        created_at: new Date(payment.created * 1000).toISOString(),
        customer_email: email,
        customer_name: customerName,
        description: payment.description,
        metadata: payment.metadata,
      };
    });

    return new Response(
      JSON.stringify({ payments }),
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
