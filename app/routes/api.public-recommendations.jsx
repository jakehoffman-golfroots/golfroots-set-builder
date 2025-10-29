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
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  console.log('=== PUBLIC API CALLED ===');

  try {
    const body = await request.json();
    console.log('Received body:', body);
    
    const {
      handicap,
      budget,
      brandPreferences = [],
      swingSpeed,
      flex,
      gender,
      handedness = 'right',
    } = body;

const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || 'golfroots.myshopify.com';
    
    // Try to get access token from database
    console.log('Attempting to get access token from database...');
    let accessToken = null;
    
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      // Get all sessions to see what we have
      const allSessions = await prisma.session.findMany({
        where: { shop: shopDomain }
      });
      
      console.log(`Found ${allSessions.length} sessions for ${shopDomain}`);
      
      // Look for offline session (has access token in state field)
      const offlineSession = allSessions.find(s => !s.isOnline && s.state);
      
      if (offlineSession) {
        accessToken = offlineSession.state;
        console.log('Found offline session with access token');
      } else {
        console.log('No offline session found. Session details:', 
          allSessions.map(s => ({ 
            id: s.id, 
            isOnline: s.isOnline, 
            hasState: !!s.state,
            hasContent: !!s.content 
          }))
        );
      }
      
      await prisma.$disconnect();
    } catch (dbError) {
      console.error('Database error:', dbError.message);
    }

    // If no token from database, check environment
    if (!accessToken) {
      console.log('No token from database, checking environment...');
      accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
      if (accessToken) {
        console.log('Found token in environment');
      }
    }

    if (!accessToken) {
      console.error('NO ACCESS TOKEN AVAILABLE');
      throw new Error('No access token configured. Please check your app installation.');
    }

    console.log('Making GraphQL request to Shopify...');

    const graphqlEndpoint = `https://${shopDomain}/admin/api/2024-10/graphql.json`;
    
    const graphqlQuery = `
      query getSetBuilderProducts {
        products(first: 250, query: "status:active") {
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
                    inventoryPolicy
                  }
                }
              }
              tags
            }
          }
        }
      }
    `;

    const shopifyResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: graphqlQuery })
    });

    console.log('Shopify response status:', shopifyResponse.status);

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify API error response:', errorText);
      throw new Error(`Shopify API error: ${shopifyResponse.status} - ${errorText}`);
    }

    const data = await shopifyResponse.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    console.log('Successfully fetched products from Shopify');

    const allProducts = data.data.products.edges.map(({ node }) => {
      const variant = node.variants.edges[0]?.node;
      const product = {
        id: node.id,
        title: node.title,
        brand: node.vendor,
        productType: node.productType,
        price: parseFloat(node.priceRangeV2.minVariantPrice.amount),
        image: node.images.edges[0]?.node.url || null,
        variantId: variant?.id,
        inventory: variant?.inventoryQuantity || 0,
        availableForSale: variant?.availableForSale || false,
        tags: node.tags,
      };
      
      // Log details for Iron products
      if (node.title.toLowerCase().includes('iron')) {
        console.log(`Product: ${node.title}`);
        console.log(`  Variant ID: ${variant?.id}`);
        console.log(`  Inventory Quantity: ${variant?.inventoryQuantity}`);
        console.log(`  Available For Sale: ${variant?.availableForSale}`);
        console.log(`  Inventory Policy: ${variant?.inventoryPolicy}`);
      }
      
      return product;
    });

    const validCategories = ['Drivers', 'Woods', 'Hybrids', 'Iron Sets', 'Wedges', 'Putters'];
    const products = allProducts.filter(p => 
      p.tags.some(tag => validCategories.includes(tag)) && 
      p.inventory > 0 && 
      p.availableForSale
    );

    console.log(`Total products: ${allProducts.length}, Golf clubs with inventory: ${products.length}`);

    const budgetAllocation = {
      driver: budget * 0.25,
      woods: budget * 0.10,
      hybrids: budget * 0.05,
      irons: budget * 0.35,
      wedges: budget * 0.15,
      putter: budget * 0.10,
    };

const recommendations = {
  driver: findBestMatches(products, 'Drivers', { handicap, budget: budgetAllocation.driver, brandPreferences, swingSpeed, flex, gender, handedness }, 3),
  woods: findBestMatches(products, 'Woods', { handicap, budget: budgetAllocation.woods, brandPreferences, swingSpeed, flex, gender, handedness }, 3),
  hybrids: findBestMatches(products, 'Hybrids', { handicap, budget: budgetAllocation.hybrids, brandPreferences, swingSpeed, flex, gender, handedness }, 3),
  irons: findBestMatches(products, 'Iron Sets', { handicap, budget: budgetAllocation.irons, brandPreferences, swingSpeed, flex, gender, handedness }, 3),
  wedges: findBestMatches(products, 'Wedges', { handicap, budget: budgetAllocation.wedges, brandPreferences, swingSpeed, flex, gender, handedness }, 3),
  putter: findBestMatches(products, 'Putters', { handicap, budget: budgetAllocation.putter, brandPreferences, flex, gender, handedness }, 3),
};

    console.log('Successfully generated recommendations');
    console.log('=== PUBLIC API SUCCESS ===');

    return new Response(JSON.stringify({ recommendations, budgetAllocation }), { 
      headers,
      status: 200
    });

  } catch (error) {
    console.error('=== PUBLIC API ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check server logs for more information',
      recommendations: {
        driver: [],
        woods: [],
        hybrids: [],
        irons: [],
        wedges: [],
        putter: []
      }
    }), { 
      headers,
      status: 500 
    });
  }
}

function findBestMatches(products, categoryTag, profile, limit = 3) {
  // ========================================================================
  // FILTERING PHASE - These filters ELIMINATE clubs entirely before scoring
  // Wrong gender or handedness = NEVER shown, regardless of other factors
  // ========================================================================
  
  const filtered = products.filter(p => {
    const hasCategory = p.tags.includes(categoryTag);
    const inStock = p.inventory > 0;
    
    // SPECIAL FILTER: For Wedges category, ONLY show Sand Wedges
    if (categoryTag === 'Wedges') {
      const isSandWedge = p.tags.includes('Sand Wedges');
      if (!isSandWedge) {
        return false; // Not a sand wedge, ELIMINATED
      }
    }
    
    // HARD FILTER #1: HANDEDNESS - Wrong handedness = ELIMINATED
    let handednessMatch = true;
    if (profile.handedness === 'left') {
      // For left-handed users, ONLY show clubs tagged as left-handed
      handednessMatch = p.tags.some(tag => 
        tag.toLowerCase().includes('left') || 
        tag.toLowerCase().includes('lefty') ||
        tag === 'handedness_left'
      );
    } else {
      // For right-handed users (default), show right-handed OR untagged clubs
      // Exclude anything explicitly tagged as left-handed
      const isLeftHanded = p.tags.some(tag => 
        tag.toLowerCase().includes('left') || 
        tag.toLowerCase().includes('lefty') ||
        tag === 'handedness_left'
      );
      handednessMatch = !isLeftHanded; // Show if NOT left-handed
    }
    
    // If handedness doesn't match, this club is ELIMINATED - return false immediately
    if (!handednessMatch) {
      return false;
    }
    
    // HARD FILTER #2: GENDER - Wrong gender = ELIMINATED
    let genderMatch = true;
    const titleLower = p.title.toLowerCase();
    const tagsLower = p.tags.map(t => t.toLowerCase());
    
    // Check if product is women's/ladies
    const isWomens = tagsLower.some(tag => 
      tag.includes('women') || 
      tag.includes('ladies') || 
      tag.includes('female') ||
      tag.includes('lady')
    ) || titleLower.includes('women') || 
        titleLower.includes('ladies') || 
        titleLower.includes('lady') ||
        titleLower.includes("women's flex") ||
        titleLower.includes("ladies flex");
    
    // Check if product is men's
    const isMens = tagsLower.some(tag => 
      tag.includes('men') || 
      tag.includes('male') ||
      tag === 'gender_male'
    ) || titleLower.includes("men's");
    
    if (profile.gender === 'male') {
      // NEVER show women's clubs to men - ELIMINATED
      genderMatch = !isWomens;
    } else if (profile.gender === 'female') {
      // ONLY show women's clubs to women (or unisex if no women's available)
      genderMatch = isWomens || (!isMens && !isWomens); // Show women's or truly unisex
    } else if (profile.gender === 'unisex') {
      // For unisex preference, exclude explicitly gendered clubs
      genderMatch = !isWomens && !isMens;
    }
    
    // Additional flex-based gender filtering for edge cases
    if (profile.flex === 'stiff' || profile.flex === 'extra-stiff') {
      // Stiff/X-Stiff flex users should NEVER see ladies flex - ELIMINATED
      const hasLadiesFlex = titleLower.includes("women's flex") || 
                           titleLower.includes("ladies flex") ||
                           tagsLower.some(tag => tag.includes("ladies flex"));
      if (hasLadiesFlex) {
        genderMatch = false;
      }
    }
    
    // If gender doesn't match, this club is ELIMINATED - return false immediately
    if (!genderMatch) {
      return false;
    }
    
    // Only clubs that pass ALL filters reach this point
    return hasCategory && inStock;
  });

  // ========================================================================
  // SCORING PHASE - Only clubs that passed ALL filters are scored here
  // At this point, all clubs have correct gender AND handedness
  // ========================================================================
  
  const scored = filtered.map(club => {
    const score = scoreClub(club, profile);
    return {
      ...club,
      score: score,
      matchReason: generateMatchReason(club, profile, score)
    };
  });

  // Sort by score DESC, then by price DESC (expensive first when tied)
  const sorted = scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score; // Higher score first
    }
    return b.price - a.price; // If tied, higher price first
  });
  
  return sorted.slice(0, Math.max(limit, sorted.length));
}

function scoreClub(club, profile) {
  // NOTE: This function only scores clubs that already passed gender/handedness filters
  // Gender and handedness mismatches have already been ELIMINATED
  
  let score = 0;
  const handicapValue = parseHandicap(profile.handicap);
  
  // ===================================
  // PRIORITY 1: FLEX MATCH (Highest weight)
  // ===================================
  if (profile.flex) {
    const hasMatchingFlex = checkFlexMatch(club, profile.flex);
    if (hasMatchingFlex) {
      score += 100; // Exact flex match requested by user - HIGHEST PRIORITY
    }
  } else if (profile.swingSpeed) {
    const idealFlex = getIdealFlexFromSpeed(profile.swingSpeed);
    const hasMatchingFlex = checkFlexMatch(club, idealFlex);
    if (hasMatchingFlex) {
      score += 100; // Flex matches swing speed - HIGHEST PRIORITY
    }
  }
  
  // ===================================
  // PRIORITY 2: STYLE MATCH (Second priority)
  // ===================================
  let idealSkillTag = '';
  if (handicapValue <= 10) {
    idealSkillTag = 'Precision';
  } else if (handicapValue <= 20) {
    idealSkillTag = 'Control & Distance';
  } else {
    idealSkillTag = 'Forgiveness';
  }
  
  const hasIdealSkill = club.tags.some(tag => 
    tag.toLowerCase().includes(idealSkillTag.toLowerCase())
  );
  
  if (hasIdealSkill) {
    score += 50; // Perfect style match
  } else {
    const hasAnySkill = club.tags.some(tag => 
      tag.toLowerCase().includes('forgiveness') ||
      tag.toLowerCase().includes('precision') ||
      tag.toLowerCase().includes('control')
    );
    if (hasAnySkill) {
      score += 25; // Has some skill tag, but not ideal
    } else {
      score += 0; // No skill tags
    }
  }
  
  // ===================================
  // PRIORITY 3: BRAND PREFERENCE (Third priority)
  // ===================================
  if (profile.brandPreferences && profile.brandPreferences.length > 0) {
    if (profile.brandPreferences.includes(club.brand)) {
      score += 20; // User's preferred brand
    }
  }
  
  // ===================================
  // PRICE (Tiebreaker - within budget only)
  // ===================================
  if (club.price <= profile.budget) {
    const budgetUsageRatio = club.price / profile.budget;
    score += Math.floor(budgetUsageRatio * 10); // 0-10 points based on price
  }
  
  // ===================================
  // GENDER MATCH (Minor bonus - already filtered, this is just a tiebreaker)
  // ===================================
  const titleLower = club.title.toLowerCase();
  const tagsLower = club.tags.map(t => t.toLowerCase());
  
  if (profile.gender === 'male') {
    if (club.tags.includes('gender_male') || tagsLower.some(t => t.includes('men'))) {
      score += 5;
    } else if (!tagsLower.some(t => t.includes('women') || t.includes('ladies'))) {
      score += 3; // Neutral/unisex club
    }
  } else if (profile.gender === 'female') {
    if (club.tags.includes('gender_female') || tagsLower.some(t => t.includes('women') || t.includes('ladies'))) {
      score += 5;
    } else if (!tagsLower.some(t => t.includes('men') || t.includes('male'))) {
      score += 3; // Neutral/unisex club
    }
  } else {
    score += 3; // Unisex preference
  }
  
  return score;
}

// NEW FUNCTION: More precise flex matching that excludes wrong flex types
function checkFlexMatch(club, requestedFlex) {
  const titleLower = club.title.toLowerCase();
  const tagsLower = club.tags.map(t => t.toLowerCase());
  const allText = [...tagsLower, titleLower].join(' ');
  
  // Define what to look for and what to EXCLUDE for each flex type
  const flexPatterns = {
    'senior': {
      include: ['senior flex', 'a flex', 'senior/womens'],
      exclude: ['regular', 'stiff', 'x stiff', 'extra stiff']
    },
    'regular': {
      include: ['regular flex', 'r flex', 'reg flex', 'flex_regular'],
      exclude: ['senior', 'stiff', 'x stiff', 'extra stiff', 'ladies']
    },
    'stiff': {
      include: ['stiff flex', 's flex', 'flex_stiff'],
      exclude: ['x stiff', 'extra stiff', 'senior', 'regular', 'ladies']
    },
    'extra-stiff': {
      include: ['x stiff', 'extra stiff', 'x flex', 'xstiff'],
      exclude: ['senior', 'regular', 'ladies']
    }
  };
  
  const pattern = flexPatterns[requestedFlex.toLowerCase()];
  if (!pattern) return false;
  
  // First check if any EXCLUDED patterns are present
  const hasExcluded = pattern.exclude.some(excludePattern => 
    allText.includes(excludePattern)
  );
  
  if (hasExcluded) {
    return false; // Has wrong flex type, not a match
  }
  
  // Then check if any INCLUDED patterns are present
  const hasIncluded = pattern.include.some(includePattern => 
    allText.includes(includePattern)
  );
  
  return hasIncluded;
}

function parseHandicap(handicapString) {
  if (handicapString === '30+') return 35;
  const match = handicapString.match(/(\d+)-(\d+)/);
  if (match) {
    return (parseInt(match[1]) + parseInt(match[2])) / 2;
  }
  return 25;
}

function getIdealFlexFromSpeed(swingSpeed) {
  const speedMap = {
    'slow': 'senior',
    'moderate': 'regular',
    'fast': 'stiff'
  };
  return speedMap[swingSpeed.toLowerCase()] || 'regular';
}

function getIdealFlexTags(swingSpeed) {
  const speedMap = {
    'slow': ['flex_senior', 'Senior Flex', 'Senior/Womens/A Flex', 'Lady'],
    'moderate': ['flex_regular', 'Regular Flex', 'reg'],
    'fast': ['flex_stiff', 'Stiff Flex', 'X Stiff Flex']
  };
  return speedMap[swingSpeed.toLowerCase()] || ['flex_regular', 'Regular Flex'];
}

function getFlexTagsFromPreference(flexPreference) {
  const flexMap = {
    'senior': ['flex_senior', 'Senior Flex', 'Senior/Womens/A Flex', 'A Flex'],
    'regular': ['flex_regular', 'Regular Flex', 'R Flex', 'reg'],
    'stiff': ['flex_stiff', 'Stiff Flex', 'S Flex'],
    'extra-stiff': ['X Stiff Flex', 'Extra Stiff', 'X Flex']
  };
  return flexMap[flexPreference.toLowerCase()] || ['flex_regular'];
}

function generateMatchReason(club, profile, score) {
  const reasons = [];
  const handicapValue = parseHandicap(profile.handicap);
  
  // Show flex match first since it's priority #1
  if (profile.flex) {
    const hasMatchingFlex = checkFlexMatch(club, profile.flex);
    if (hasMatchingFlex) {
      reasons.push("Perfect flex");
    }
  } else if (profile.swingSpeed) {
    const idealFlex = getIdealFlexFromSpeed(profile.swingSpeed);
    const hasMatchingFlex = checkFlexMatch(club, idealFlex);
    if (hasMatchingFlex) {
      reasons.push("Right flex");
    }
  }
  
  // Then show skill level match
  if (handicapValue <= 10 && club.tags.some(tag => tag.toLowerCase().includes('precision'))) {
    reasons.push("Tour-level precision");
  } else if (handicapValue > 10 && handicapValue <= 20 && club.tags.some(tag => tag.toLowerCase().includes('control'))) {
    reasons.push("Great control & distance");
  } else if (handicapValue > 20 && club.tags.some(tag => tag.toLowerCase().includes('forgiveness'))) {
    reasons.push("Maximum forgiveness");
  }
  
  if (club.price <= profile.budget * 0.9) {
    reasons.push("Excellent value");
  } else if (club.price <= profile.budget) {
    reasons.push("Within budget");
  }
  
  if (profile.brandPreferences?.includes(club.brand)) {
    reasons.push("Your preferred brand");
  }
  
  if (reasons.length === 0) {
    if (score >= 40) {
      reasons.push("Good option for your game");
    } else {
      reasons.push("Available option");
    }
  }
  
  return reasons.join(" • ");
}