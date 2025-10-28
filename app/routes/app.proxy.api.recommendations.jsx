import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { admin } = await authenticate.public.appProxy(request);
  const body = await request.json();
  
  const {
    handicap,
    budget,
    brandPreferences,
    swingSpeed,
    flex,
    gender,
  } = body;

  console.log('Received profile:', { handicap, budget, brandPreferences, swingSpeed, flex, gender });

  // Fetch active products
  const response = await admin.graphql(
    `#graphql
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
  const allProducts = data.data.products.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    brand: node.vendor,
    productType: node.productType,
    price: parseFloat(node.priceRangeV2.minVariantPrice.amount),
    image: node.images.edges[0]?.node.url || null,
    variantId: node.variants.edges[0]?.node.id,
    inventory: node.variants.edges[0]?.node.inventoryQuantity || 0,
    tags: node.tags,
  }));

  // Filter to only golf clubs with category tags
  const validCategories = ['Drivers', 'Woods', 'Hybrids', 'Iron Sets', 'Wedges', 'Putters'];
  const products = allProducts.filter(p => 
    p.tags.some(tag => validCategories.includes(tag)) && p.inventory > 0
  );

  console.log(`Total products fetched: ${allProducts.length}`);
  console.log(`Golf club products with inventory: ${products.length}`);

  // Calculate budget allocation
  const budgetAllocation = {
    driver: budget * 0.25,
    woods: budget * 0.05,
    hybrids: budget * 0.05,
    irons: budget * 0.35,
    wedges: budget * 0.15,
    putter: budget * 0.15,
  };

  // Generate recommendations for each category
  const recommendations = {
    driver: findBestMatches(products, 'Drivers', { handicap, budget: budgetAllocation.driver, brandPreferences, swingSpeed, flex, gender }, 3),
    woods: findBestMatches(products, 'Woods', { handicap, budget: budgetAllocation.woods, brandPreferences, swingSpeed, flex, gender }, 3),
    hybrids: findBestMatches(products, 'Hybrids', { handicap, budget: budgetAllocation.hybrids, brandPreferences, swingSpeed, flex, gender }, 3),
    irons: findBestMatches(products, 'Iron Sets', { handicap, budget: budgetAllocation.irons, brandPreferences, swingSpeed, flex, gender }, 3),
    wedges: findBestMatches(products, 'Wedges', { handicap, budget: budgetAllocation.wedges, brandPreferences, swingSpeed, flex, gender }, 3),
    putter: findBestMatches(products, 'Putters', { handicap, budget: budgetAllocation.putter, brandPreferences, flex, gender }, 3),
  };

  return Response.json({ recommendations, budgetAllocation });
}

// Copy all the helper functions from your existing api.recommendations.jsx
// (findBestMatches, scoreClub, parseHandicap, getIdealFlexTags, getFlexTagsFromPreference, generateMatchReason)

function findBestMatches(products, categoryTag, profile, limit = 3) {
  const filtered = products.filter(p => {
    const hasCategory = p.tags.includes(categoryTag);
    const inStock = p.inventory > 0;
    return hasCategory && inStock;
  });

  const scored = filtered.map(club => {
    const score = scoreClub(club, profile);
    return {
      ...club,
      score: score,
      matchReason: generateMatchReason(club, profile, score)
    };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  return sorted.slice(0, Math.max(limit, sorted.length));
}

function scoreClub(club, profile) {
  let score = 0;
  
  const handicapValue = parseHandicap(profile.handicap);
  
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
    score += 40;
  } else {
    const hasAnySkill = club.tags.some(tag => 
      tag.toLowerCase().includes('forgiveness') ||
      tag.toLowerCase().includes('precision') ||
      tag.toLowerCase().includes('control')
    );
    if (hasAnySkill) {
      score += 20;
    } else {
      score += 15;
    }
  }
  
  if (club.price <= profile.budget) {
    const priceRatio = club.price / profile.budget;
    if (priceRatio >= 0.7) {
      score += 30;
    } else if (priceRatio >= 0.5) {
      score += 25;
    } else {
      score += 20;
    }
  } else if (club.price <= profile.budget * 1.15) {
    score += 10;
  }
  
  if (profile.brandPreferences && profile.brandPreferences.length > 0) {
    if (profile.brandPreferences.includes(club.brand)) {
      score += 15;
    }
  } else {
    score += 7;
  }
  
  if (profile.flex) {
    const requestedFlexTags = getFlexTagsFromPreference(profile.flex);
    const hasMatchingFlex = club.tags.some(tag => 
      requestedFlexTags.some(flexTag => 
        tag.toLowerCase().includes(flexTag.toLowerCase())
      )
    );
    if (hasMatchingFlex) {
      score += 10;
    }
  } else if (profile.swingSpeed) {
    const idealFlexTags = getIdealFlexTags(profile.swingSpeed);
    const hasMatchingFlex = club.tags.some(tag => 
      idealFlexTags.some(flexTag => 
        tag.toLowerCase().includes(flexTag.toLowerCase())
      )
    );
    if (hasMatchingFlex) {
      score += 10;
    }
  }
  
  if (profile.gender === 'male') {
    if (club.tags.includes('gender_male') || club.tags.includes('MEN')) {
      score += 5;
    } else if (!club.tags.includes('gender_female') && !club.tags.includes('WOMEN')) {
      score += 3;
    }
  } else if (profile.gender === 'female') {
    if (club.tags.includes('gender_female') || club.tags.includes('WOMEN')) {
      score += 5;
    } else if (!club.tags.includes('gender_male') && !club.tags.includes('MEN')) {
      score += 3;
    }
  } else {
    score += 3;
  }
  
  return score;
}

function parseHandicap(handicapString) {
  if (handicapString === '30+') return 35;
  const match = handicapString.match(/(\d+)-(\d+)/);
  if (match) {
    return (parseInt(match[1]) + parseInt(match[2])) / 2;
  }
  return 25;
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
  
  if (profile.flex) {
    const requestedFlexTags = getFlexTagsFromPreference(profile.flex);
    if (club.tags.some(tag => 
      requestedFlexTags.some(flexTag => tag.toLowerCase().includes(flexTag.toLowerCase()))
    )) {
      reasons.push("Perfect flex");
    }
  } else if (profile.swingSpeed) {
    const idealFlexTags = getIdealFlexTags(profile.swingSpeed);
    if (club.tags.some(tag => 
      idealFlexTags.some(flexTag => tag.toLowerCase().includes(flexTag.toLowerCase()))
    )) {
      reasons.push("Right flex");
    }
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
