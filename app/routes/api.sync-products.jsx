import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function loader({ request }) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  return new Response(null, { headers, status: 204 });
}

export async function action({ request }) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  console.log('=== PRODUCT SYNC STARTED ===');
  const startTime = Date.now();

  try {
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || 'golfroots.myshopify.com';
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!accessToken) {
      throw new Error('No access token available');
    }

    const graphqlEndpoint = `https://${shopDomain}/admin/api/2024-10/graphql.json`;

    // Fetch ALL golf club products with pagination
    let allProductsFromShopify = [];
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;
    const MAX_PAGES = 40; // 40 pages × 250 = 10,000 products max

    while (hasNextPage && pageCount < MAX_PAGES) {
      pageCount++;

      const graphqlQuery = `
        query getGolfProducts${cursor ? '($cursor: String!)' : ''} {
          products(
            first: 250
            ${cursor ? ', after: $cursor' : ''}
            query: "status:active AND (tag:Drivers OR tag:Woods OR tag:Hybrids OR tag:'Iron Sets' OR tag:Wedges OR tag:Putters OR tag:'Sand Wedges')"
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                vendor
                productType
                priceRangeV2 {
                  minVariantPrice {
                    amount
                  }
                }
                images(first: 1) {
                  edges {
                    node {
                      url
                    }
                  }
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      inventoryQuantity
                      availableForSale
                    }
                  }
                }
                tags
              }
            }
          }
        }
      `;

      const variables = cursor ? { cursor } : {};

      const shopifyResponse = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: variables
        })
      });

      if (!shopifyResponse.ok) {
        const errorText = await shopifyResponse.text();
        throw new Error(`Shopify API error: ${shopifyResponse.status} - ${errorText}`);
      }

      const data = await shopifyResponse.json();

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      allProductsFromShopify.push(...data.data.products.edges);
      console.log(`📦 Fetched page ${pageCount}: ${allProductsFromShopify.length} total products so far`);

      hasNextPage = data.data.products.pageInfo.hasNextPage;
      cursor = data.data.products.pageInfo.endCursor;
    }

    console.log(`✅ Fetched ${allProductsFromShopify.length} products from Shopify in ${pageCount} pages`);

    // Transform and save to database
    const productsToSave = allProductsFromShopify.map(({ node }) => {
      const variant = node.variants.edges[0]?.node;
      return {
        shopifyId: node.id,
        title: node.title,
        brand: node.vendor,
        productType: node.productType,
        price: parseFloat(node.priceRangeV2.minVariantPrice.amount),
        image: node.images.edges[0]?.node.url || null,
        variantId: variant?.id || '',
        inventory: variant?.inventoryQuantity || 0,
        availableForSale: variant?.availableForSale || false,
        tags: node.tags,
        lastSynced: new Date(),
      };
    });

    // Clear old products and insert new ones
    console.log('🗑️  Clearing old products from database...');
    await prisma.golfProduct.deleteMany({});

    console.log('💾 Inserting new products into database...');
    // Insert in batches of 500 to avoid timeout
    const batchSize = 500;
    for (let i = 0; i < productsToSave.length; i += batchSize) {
      const batch = productsToSave.slice(i, i + batchSize);
      await prisma.golfProduct.createMany({
        data: batch,
        skipDuplicates: true,
      });
      console.log(`   Batch ${Math.floor(i / batchSize) + 1}: Inserted ${Math.min(i + batchSize, productsToSave.length)}/${productsToSave.length} products`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    const breakdown = {
      drivers: productsToSave.filter(p => p.tags.includes('Drivers')).length,
      woods: productsToSave.filter(p => p.tags.includes('Woods')).length,
      hybrids: productsToSave.filter(p => p.tags.includes('Hybrids')).length,
      irons: productsToSave.filter(p => p.tags.includes('Iron Sets')).length,
      wedges: productsToSave.filter(p => p.tags.includes('Wedges') || p.tags.includes('Sand Wedges')).length,
      putters: productsToSave.filter(p => p.tags.includes('Putters')).length,
    };

    console.log('=== 🎉 SYNC COMPLETE ===');
    console.log(`⏱️  Time: ${elapsed}s`);
    console.log(`📊 Breakdown:`, breakdown);

    await prisma.$disconnect();

    return new Response(JSON.stringify({
      success: true,
      totalProducts: productsToSave.length,
      timeSeconds: parseFloat(elapsed),
      breakdown,
      message: 'Product sync completed successfully'
    }), {
      headers,
      status: 200
    });

  } catch (error) {
    console.error('=== ❌ SYNC ERROR ===');
    console.error(error);
    await prisma.$disconnect();

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers,
      status: 500
    });
  }
}