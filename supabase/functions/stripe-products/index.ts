import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StripePrice {
  id: string;
  object: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: {
    interval: string;
    interval_count: number;
  } | null;
}

interface StripeProduct {
  id: string;
  object: string;
  active: boolean;
  name: string;
  description: string | null;
  images: string[];
  metadata: Record<string, string>;
}

interface StripePriceListResponse {
  data: StripePrice[];
  has_more: boolean;
}

interface StripeProductListResponse {
  data: StripeProduct[];
  has_more: boolean;
}

// NOTE: verify_jwt is set to false for testing.
// TODO: Re-enable JWT verification in production by setting verify_jwt=true
Deno.serve(async (req: Request) => {
  console.log("stripe-products invoked", {
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
    const includeInactive = url.searchParams.get("include_inactive") === "true";

    // Fetch products from Stripe
    const productsResponse = await fetch(
      `https://api.stripe.com/v1/products?limit=100${includeInactive ? '' : '&active=true'}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!productsResponse.ok) {
      const error = await productsResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch Stripe products", details: error }),
        {
          status: productsResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const productsData: StripeProductListResponse = await productsResponse.json();

    // Fetch all prices
    const pricesResponse = await fetch(
      `https://api.stripe.com/v1/prices?limit=100${includeInactive ? '' : '&active=true'}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!pricesResponse.ok) {
      const error = await pricesResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch Stripe prices", details: error }),
        {
          status: pricesResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const pricesData: StripePriceListResponse = await pricesResponse.json();

    // Group prices by product
    const pricesByProduct = new Map<string, Array<{
      id: string;
      unit_amount: number | null;
      currency: string;
      recurring_interval: string | null;
      active: boolean;
    }>>();

    for (const price of pricesData.data) {
      const productId = (price as any).product;
      if (!pricesByProduct.has(productId)) {
        pricesByProduct.set(productId, []);
      }
      pricesByProduct.get(productId)!.push({
        id: price.id,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring_interval: price.recurring?.interval || null,
        active: price.active,
      });
    }

    // Build product list with prices
    const products = productsData.data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      active: product.active,
      images: product.images,
      metadata: product.metadata,
      prices: pricesByProduct.get(product.id) || [],
    }));

    return new Response(
      JSON.stringify({ products }),
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
