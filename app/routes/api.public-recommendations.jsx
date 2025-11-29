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
      height,
    } = body;

    // Fetch products from database
    console.log('📦 Fetching products from database...');
    const allProducts = await prisma.golfProduct.findMany({
      where: {
        availableForSale: true,
        inventory: { gt: 0 }
      }
    });

    console.log(`📊 Found ${allProducts.length} products in database`);

    if (allProducts.length === 0) {
      console.error('No products found in database. Run sync first: POST /api/sync-products');
      throw new Error('No products available. Please run product sync first.');
    }

    // Filter for valid golf clubs - EXCLUDE shafts, headcovers, and accessories
    const validCategories = ['Drivers', 'Woods', 'Hybrids', 'Iron Sets', 'Wedges', 'Putters'];
    const products = allProducts.filter(p => {
      const hasValidCategory = p.tags.some(tag => validCategories.includes(tag));
      
      // If it doesn't have a valid club category, exclude it
      if (!hasValidCategory) {
        return false;
      }
      
      const titleLower = p.title.toLowerCase();
      const productTypeLower = p.productType?.toLowerCase() || '';
      
      // Only exclude if productType is explicitly "Shaft" or "Shafts"
      // (Complete clubs may mention shaft in title but won't have productType = "Shaft")
      const isStandaloneShaft = (productTypeLower === 'shaft' || productTypeLower === 'shafts');
      
      // Exclude headcovers
      const isHeadcover = productTypeLower.includes('headcover') ||
                         productTypeLower.includes('head cover') ||
                         titleLower.includes('headcover') ||
                         titleLower.includes('head cover');
      
      return !isStandaloneShaft && !isHeadcover;
    });

    console.log(`📊 Total golf clubs with inventory: ${products.length}`);

    // Log breakdown by category
    const breakdown = {
      drivers: products.filter(p => p.tags.includes('Drivers')).length,
      woods: products.filter(p => p.tags.includes('Woods')).length,
      hybrids: products.filter(p => p.tags.includes('Hybrids')).length,
      irons: products.filter(p => p.tags.includes('Iron Sets')).length,
      wedges: products.filter(p => p.tags.includes('Wedges') || p.tags.includes('Sand Wedges')).length,
      putters: products.filter(p => p.tags.includes('Putters')).length,
    };

    console.log(`📊 Category breakdown:`, breakdown);

    const budgetAllocation = {
      driver: budget * 0.35,
      woods: budget * 0.15,
      hybrids: budget * 0.15,
      irons: budget * 0.4,
      wedges: budget * 0.10,
      putter: budget * 0.15,
    };

    const recommendations = {
      driver: findBestMatches(products, 'Drivers', { handicap, budget: budgetAllocation.driver, brandPreferences, swingSpeed, flex, gender, handedness, height }, 12),
      woods: findBestMatches(products, 'Woods', { handicap, budget: budgetAllocation.woods, brandPreferences, swingSpeed, flex, gender, handedness, height }, 12),
      hybrids: findBestMatches(products, 'Hybrids', { handicap, budget: budgetAllocation.hybrids, brandPreferences, swingSpeed, flex, gender, handedness, height }, 12),
      irons: findBestMatches(products, 'Iron Sets', { handicap, budget: budgetAllocation.irons, brandPreferences, swingSpeed, flex, gender, handedness, height }, 12),
      wedges: findBestMatches(products, 'Wedges', { handicap, budget: budgetAllocation.wedges, brandPreferences, swingSpeed, flex, gender, handedness, height }, 12),
      putter: findBestMatches(products, 'Putters', { handicap, budget: budgetAllocation.putter, brandPreferences, flex, gender, handedness, height }, 12),
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

function findBestMatches(products, categoryTag, profile, limit = 12) {
  console.log(`\n🔍 Finding matches for ${categoryTag}...`);
  console.log(`  Starting with ${products.filter(p => p.tags.includes(categoryTag)).length} products in this category`);
  
  // ========================================================================
  // FILTERING PHASE - These filters ELIMINATE clubs entirely before scoring
  // Wrong gender, handedness, shafts, or headcovers = NEVER shown
  // ========================================================================
  
  const filtered = products.filter(p => {
    const hasCategory = p.tags.includes(categoryTag);
    const inStock = p.inventory > 0;
    
    const titleLower = p.title.toLowerCase();
    const productTypeLower = p.productType?.toLowerCase() || '';
    
    // Only exclude if productType is explicitly "Shaft" or "Shafts"
    const isStandaloneShaft = (productTypeLower === 'shaft' || productTypeLower === 'shafts');
    
    if (isStandaloneShaft) {
      console.log(`  ❌ Excluded shaft: ${p.title}`);
      return false;
    }
    
    // CRITICAL: Exclude headcovers
    const isHeadcover = productTypeLower.includes('headcover') ||
                       productTypeLower.includes('head cover') ||
                       titleLower.includes('headcover') ||
                       titleLower.includes('head cover');
    
    if (isHeadcover) {
      return false;
    }
    
    // SPECIAL FILTER: For Wedges category, ONLY show Sand Wedges
    if (categoryTag === 'Wedges') {
      const isSandWedge = p.tags.includes('Sand Wedges');
      if (!isSandWedge) {
        return false; // Not a sand wedge, ELIMINATED
      }
    }
    
    // HARD FILTER #1: HANDEDNESS
    let handednessMatch = true;
    
    if (profile.handedness === 'left') {
      // For left-handed users, ONLY show clubs explicitly tagged as left-handed
      handednessMatch = p.tags.some(tag => 
        tag.toLowerCase().includes('left') || 
        tag.toLowerCase().includes('lefty') ||
        tag === 'handedness_left'
      );
    } else {
      // For right-handed users (default), ONLY exclude if explicitly left-handed
      const isExplicitlyLeftHanded = p.tags.some(tag => 
        tag.toLowerCase().includes('left hand') ||
        tag.toLowerCase().includes('left-hand') ||
        tag.toLowerCase().includes('lefty') ||
        tag === 'handedness_left'
      );
      handednessMatch = !isExplicitlyLeftHanded;
    }
    
    if (!handednessMatch) {
      return false;
    }
    
    // HARD FILTER #2: GENDER - Wrong gender = ELIMINATED
    let genderMatch = true;
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
      // STRICTLY show ONLY women's clubs - no unisex, no men's
      genderMatch = isWomens;
    } else if (profile.gender === 'unisex') {
      // For unisex preference, exclude explicitly gendered clubs
      genderMatch = !isWomens && !isMens;
    }
    
    // Additional flex-based gender filtering for edge cases
    // Skip flex filtering for wedges UNLESS it's women's flex
    if (categoryTag !== 'Wedges' && (profile.flex === 'stiff' || profile.flex === 'extra-stiff')) {
      // Stiff/X-Stiff flex users should NEVER see ladies flex - ELIMINATED
      const hasLadiesFlex = titleLower.includes("women's flex") || 
                           titleLower.includes("ladies flex") ||
                           tagsLower.some(tag => tag.includes("ladies flex"));
      if (hasLadiesFlex) {
        genderMatch = false;
      }
    }
    
    // For wedges, ONLY filter out ladies flex if gender is male (not based on flex preference)
    if (categoryTag === 'Wedges' && profile.gender === 'male') {
      const hasLadiesFlex = titleLower.includes("women's flex") || 
                           titleLower.includes("ladies flex") ||
                           titleLower.includes("women") ||
                           titleLower.includes("ladies") ||
                           tagsLower.some(tag => tag.includes("ladies flex"));
      if (hasLadiesFlex) {
        genderMatch = false;
      }
    }
    
    // If gender doesn't match, this club is ELIMINATED
    if (!genderMatch) {
      return false;
    }
    
    // Only clubs that pass ALL filters reach this point
    return hasCategory && inStock;
  });

  console.log(`  ✅ After all filters: ${filtered.length} products remain`);
  if (filtered.length > 0) {
    console.log(`  Example products: ${filtered.slice(0, 3).map(p => p.title).join(', ')}`);
  }

  // ========================================================================
  // SCORING PHASE - Only clubs that passed ALL filters are scored here
  // At this point, all clubs have correct gender AND handedness
  // ========================================================================
  
  const scored = filtered.map(club => {
    const score = scoreClub(club, profile, categoryTag);
    return {
      ...club,
      score: score,
      matchReason: generateMatchReason(club, profile, score, categoryTag)
    };
  });

  // Sort by score DESC, then by price ASC (cheaper is better if scores are equal)
  const sorted = scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.price - b.price;
  });

  return sorted.slice(0, limit);
}

function scoreClub(club, profile, categoryTag) {
  let score = 0;
  const handicapValue = parseHandicap(profile.handicap);
  
  // PRIORITY #1: FLEX MATCHING (50 points max)
  // Skip flex scoring for wedges unless it's a women's wedge scenario
  const shouldScoreFlex = categoryTag !== 'Wedges' || profile.gender === 'female';
  
  if (shouldScoreFlex) {
    if (profile.flex) {
      const requestedFlexTags = getFlexTagsFromPreference(profile.flex);
      const hasMatchingFlex = club.tags.some(tag => {
        const tagLower = tag.toLowerCase();
        return requestedFlexTags.some(flexTag => {
          const flexTagLower = flexTag.toLowerCase();
          // Exact match or word boundary match to avoid "stiff" matching "x stiff"
          if (tagLower === flexTagLower) return true;
          // For "Stiff Flex" style tags, make sure it's not "X Stiff Flex"
          if (flexTagLower.includes('stiff') && !flexTagLower.includes('x ') && !flexTagLower.includes('extra')) {
            // This is regular stiff - make sure tag doesn't have X/Extra
            return tagLower.includes(flexTagLower) && !tagLower.includes('x stiff') && !tagLower.includes('extra stiff');
          }
          return tagLower === flexTagLower;
        });
      });
      
      if (hasMatchingFlex) {
        score += 50; // Perfect flex match
      } else {
        score += 0; // Wrong flex = significant penalty
      }
    } else if (profile.swingSpeed) {
      const idealFlexTags = getIdealFlexTags(profile.swingSpeed);
      const hasIdealFlex = club.tags.some(tag => {
        const tagLower = tag.toLowerCase();
        return idealFlexTags.some(flexTag => {
          const flexTagLower = flexTag.toLowerCase();
          if (tagLower === flexTagLower) return true;
          if (flexTagLower.includes('stiff') && !flexTagLower.includes('x ') && !flexTagLower.includes('extra')) {
            return tagLower.includes(flexTagLower) && !tagLower.includes('x stiff') && !tagLower.includes('extra stiff');
          }
          return tagLower === flexTagLower;
        });
      });
      
      if (hasIdealFlex) {
        score += 50; // Ideal flex for swing speed
      } else {
        score += 0; // Wrong flex = significant penalty
      }
    }
  } else {
    // For wedges (non-women's), give neutral flex score since flex doesn't matter
    score += 25; // Neutral score - don't penalize wedges for not having flex options
  }
  
  // PRIORITY #2: SKILL LEVEL (40 points max)
  // Skip skill level scoring for wedges - forgiveness doesn't matter for wedges
  if (categoryTag !== 'Wedges') {
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
      score += 40; // Perfect skill match
    } else {
      const hasAnySkill = club.tags.some(tag => 
        tag.toLowerCase().includes('forgiveness') ||
        tag.toLowerCase().includes('precision') ||
        tag.toLowerCase().includes('control')
      );
      if (hasAnySkill) {
        score += 20; // Has a skill tag, just not ideal
      } else {
        score += 15; // No skill tags
      }
    }
  } else {
    // For wedges, give neutral skill score - forgiveness doesn't apply
    score += 20;
  }
  
  // PRIORITY #3: PRICE FIT (30 points max, 40 for wedges)
  const pricePoints = categoryTag === 'Wedges' ? 40 : 30;
  
  if (club.price <= profile.budget) {
    const priceRatio = club.price / profile.budget;
    if (priceRatio >= 0.85) {
      score += pricePoints; // Premium option - 85-100% of budget gets max points
    } else if (priceRatio >= 0.70) {
      score += Math.floor(pricePoints * 0.85); // Good option - 70-85% of budget
    } else if (priceRatio >= 0.50) {
      score += Math.floor(pricePoints * 0.70); // Mid-range option - 50-70% of budget
    } else if (priceRatio >= 0.30) {
      score += Math.floor(pricePoints * 0.50); // Budget option - 30-50% of budget
    } else {
      score += Math.floor(pricePoints * 0.25); // Very cheap - under 30% of budget (penalize)
    }
  } else if (club.price <= profile.budget * 1.05) {
    score += Math.floor(pricePoints * 0.60); // Slightly over budget (up to 5% over)
  } else {
    // Over budget - give minimal points so it ranks low
    score += 0;
  }
  
  // PRIORITY #4: BRAND PREFERENCE (15 points, 25 for wedges)
  const brandPoints = categoryTag === 'Wedges' ? 25 : 15;
  
  if (profile.brandPreferences && profile.brandPreferences.length > 0) {
    if (profile.brandPreferences.includes(club.brand)) {
      score += brandPoints;
    }
  } else {
    // If no brand preference specified, boost well-known brands for wedges
    if (categoryTag === 'Wedges') {
      const premiumBrands = ['Titleist', 'Callaway', 'TaylorMade', 'Ping', 'Cleveland', 'Mizuno', 'Vokey'];
      if (premiumBrands.includes(club.brand)) {
        score += Math.floor(brandPoints * 0.6); // Bonus for premium brands
      }
    }
  }
  
  // PRIORITY #5: GENDER (already filtered, small bonus - 5 points)
  const titleLower = club.title.toLowerCase();
  const tagsLower = club.tags.map(t => t.toLowerCase());
  
  const isWomens = tagsLower.some(tag => 
    tag.includes('women') || tag.includes('ladies')
  ) || titleLower.includes('women') || titleLower.includes('ladies');
  
  const isMens = tagsLower.some(tag => 
    tag.includes('men') || tag.includes('male')
  ) || titleLower.includes("men's");
  
  if (profile.gender === 'male' && isMens) {
    score += 5;
  } else if (profile.gender === 'female' && isWomens) {
    score += 5;
  } else if (profile.gender === 'unisex' && !isWomens && !isMens) {
    score += 5;
  }
  
  return score;
}

function parseHandicap(handicap) {
  if (!handicap) return 20;
  const str = String(handicap).toLowerCase();
  if (str.includes('scratch') || str === '0') return 0;
  if (str.includes('beginner')) return 30;
  const num = parseInt(str.replace(/[^0-9]/g, ''));
  return isNaN(num) ? 20 : num;
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

function generateMatchReason(club, profile, score, categoryTag) {
  const reasons = [];
  const handicapValue = parseHandicap(profile.handicap);
  
  // Prioritize flex matching in reasons (but skip for wedges unless women's)
  const shouldMentionFlex = categoryTag !== 'Wedges' || profile.gender === 'female';
  
  if (shouldMentionFlex) {
    if (profile.flex) {
      const requestedFlexTags = getFlexTagsFromPreference(profile.flex);
      if (club.tags.some(tag => 
        requestedFlexTags.some(flexTag => tag.toLowerCase().includes(flexTag.toLowerCase()))
      )) {
        reasons.push("Perfect flex match");
      }
    } else if (profile.swingSpeed) {
      const idealFlexTags = getIdealFlexTags(profile.swingSpeed);
      if (club.tags.some(tag => 
        idealFlexTags.some(flexTag => tag.toLowerCase().includes(flexTag.toLowerCase()))
      )) {
        reasons.push("Ideal flex for your speed");
      }
    }
  }
  
  // Then skill level (skip for wedges)
  if (categoryTag !== 'Wedges') {
    if (handicapValue <= 10 && club.tags.some(tag => tag.toLowerCase().includes('precision'))) {
      reasons.push("Tour-level precision");
    } else if (handicapValue > 10 && handicapValue <= 20 && club.tags.some(tag => tag.toLowerCase().includes('control'))) {
      reasons.push("Great control & distance");
    } else if (handicapValue > 20 && club.tags.some(tag => tag.toLowerCase().includes('forgiveness'))) {
      reasons.push("Maximum forgiveness");
    }
  }
  
  // Price
  if (club.price <= profile.budget * 0.9) {
    reasons.push("Excellent value");
  } else if (club.price <= profile.budget) {
    reasons.push("Within budget");
  }
  
  // Brand
  if (profile.brandPreferences?.includes(club.brand)) {
    reasons.push("Your preferred brand");
  } else if (categoryTag === 'Wedges') {
    // For wedges, mention premium brands
    const premiumBrands = ['Titleist', 'Callaway', 'TaylorMade', 'Ping', 'Cleveland', 'Mizuno', 'Vokey'];
    if (premiumBrands.includes(club.brand)) {
      reasons.push("Premium brand");
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