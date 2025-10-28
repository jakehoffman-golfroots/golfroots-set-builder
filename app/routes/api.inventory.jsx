import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.public.appProxy(request);
  
  try {
    // Query products with set-builder-eligible tag
    const response = await admin.graphql(
      `#graphql
        query getSetBuilderProducts {
          products(first: 50, query: "tag:set-builder-eligible") {
            edges {
              node {
                id
                title
                vendor
                priceRangeV2 {
                  minVariantPrice {
                    amount
                  }
                }
                images(first: 1) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      inventoryQuantity
                    }
                  }
                }
                tags
              }
            }
          }
        }
      `
    );

    const data = await response.json();
    
    // Transform data
    const products = data.data.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      brand: node.vendor,
      price: parseFloat(node.priceRangeV2.minVariantPrice.amount),
      image: node.images.edges[0]?.node.url || null,
      variantId: node.variants.edges[0]?.node.id,
      inventory: node.variants.edges[0]?.node.inventoryQuantity || 0,
      tags: node.tags,
    }));

    return Response.json({ products, count: products.length });
    
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return Response.json({ error: 'Failed to fetch inventory', products: [] }, { status: 500 });
  }
}