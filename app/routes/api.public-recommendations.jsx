import { PrismaClient } from '@prisma/client';

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

    console.log('Loading products from database...');
    const dbStartTime = Date.now();

    // Read from database instead of Shopify API
    const prisma = new PrismaClient();

    const allProducts = await prisma.golfProduct.findMany({
      where: {
        availableForSale: true,
        inventory: {
          gt: 0
        }
      }
    });

    await prisma.$disconnect();

    const dbElapsed = Date.now() - dbStartTime;
    console.log(`✅ Loaded ${allProducts.length} products from database in ${dbElapsed}ms`);

    // Check if data is stale (older than 2 hours)
    if (allProducts.length > 0) {
      const oldestSync = allProducts[0]?.lastSynced;
      if (oldestSync) {
        const ageHours = (Date.now() - new Date(oldestSync).getTime()) / (1000 * 60 * 60);
        if (ageHours > 2) {
          console.log(`⚠️  Product data is ${ageHours.toFixed(1)} hours old - consider running sync`);
        } else {
          console.log(`✅ Product data is fresh (${ageHours.toFixed(1)} hours old)`);
        }
      }
    }

    if (allProducts.length === 0) {
      console.error('❌ No products in database! Run sync first: POST /api/sync-products');
      throw new Error('No products available. Please run product sync first.');
    }

    // Filter for valid golf clubs
    const validCategories = ['Drivers', 'Woods', 'Hybrids', 'Iron Sets', 'Wedges', 'Putters'];
    const products = allProducts.filter(p =>
      p.tags.some(tag => validCategories.includes(tag))
    );

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
      driver: budget * 0.3,
      woods: budget * 0.15,
      hybrids: budget * 0.10,
      irons: budget * 0.4,
      wedges: budget * 0.12,
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

// Height-to-length mappings
function getAcceptableLengths(height, category) {
  if (!height) return null; // No height filtering if not provided
  
  const heightInches = parseInt(height);
  
  console.log(`\n🔍 Height filter check: ${heightInches}" for ${category}`);
  
  if (category === 'Drivers') {
    // 5'5" (65") and under to 5'9" (69")
    if (heightInches <= 69) {
      console.log(`  → Acceptable driver lengths: 44"-45"`);
      return ['44"', '44.25"', '44.5"', '44.75"', '45"'];
    }
    // 5'10" (70") to 6'2" (74")
    else if (heightInches >= 70 && heightInches <= 74) {
      console.log(`  → Acceptable driver lengths: 44.5"-45.5"`);
      return ['44.5"', '44.75"', '45"', '45.25"', '45.5"'];
    }
    // 6'3" (75") to 6'4" (76") and up
    else if (heightInches >= 75) {
      console.log(`  → Acceptable driver lengths: 45"-46"`);
      return ['45"', '45.25"', '45.5"', '45.75"', '46"'];
    }
  }
  
  if (category === 'Iron Sets') {
    // 5'5" (65") and under to 5'9" (69")
    if (heightInches <= 69) {
      console.log(`  → Acceptable iron lengths: -1" to Standard`);
      return ['-1"', '-0.75"', '-0.5"', '-0.25"', 'Standard', 'Standard Length'];
    }
    // 5'10" (70") to 6'2" (74")
    else if (heightInches >= 70 && heightInches <= 74) {
      console.log(`  → Acceptable iron lengths: -0.5" to +0.5"`);
      return ['-0.5"', '-0.25"', 'Standard', 'Standard Length', '+0.25"', '+0.5"'];
    }
    // 6'3" (75") to 6'4" (76") and up
    else if (heightInches >= 75) {
      console.log(`  → Acceptable iron lengths: Standard to +1"`);
      return ['Standard', 'Standard Length', '+0.25"', '+0.5"', '+0.75"', '+1"'];
    }
  }
  
  return null; // No height filtering for other categories
}

function checkLengthMatch(product, acceptableLengths) {
  if (!acceptableLengths) return true; // No filtering needed
  
  // Check both title and tags for length indicators
  const title = product.title;
  const tags = product.tags;
  
  console.log(`  🔍 Checking: ${title}`);
  console.log(`  📝 Tags: ${tags.join(', ')}`);
  
  // For each acceptable length, check for exact matches
  const hasMatch = acceptableLengths.some(acceptableLength => {
    // Remove quotes and get numeric value for comparison
    const cleanAcceptable = acceptableLength.replace(/"/g, '');
    
    // Strategy 1: Check tags for EXACT match
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      const acceptableLower = acceptableLength.toLowerCase();
      
      // Exact tag match
      if (tagLower === acceptableLower || tagLower === cleanAcceptable) {
        console.log(`  ✅ EXACT TAG MATCH: "${tag}" === "${acceptableLength}"`);
        return true;
      }
      
      // Tag contains the exact length with quote or inch
      if (tagLower === cleanAcceptable + '"' || 
          tagLower === cleanAcceptable + ' inch' ||
          tagLower === cleanAcceptable + ' in' ||
          tagLower === cleanAcceptable + 'inch' ||
          tagLower === cleanAcceptable + 'in') {
        console.log(`  ✅ TAG MATCH: "${tag}" matches "${acceptableLength}"`);
        return true;
      }
    }
    
    // Strategy 2: Check title for length WITH context
    const titleLower = title.toLowerCase();
    
    // For numeric lengths like "44", "44.5", "45.5", etc.
    if (/^[0-9+\-\.]+\"?$/.test(cleanAcceptable)) {
      // Build very specific patterns that won't match partial numbers
      const patterns = [
        // Length at end of string with quote: "44\""
        new RegExp(`${cleanAcceptable.replace(/[+\-\.]/g, '\\$&')}"\\s*$`, 'i'),
        // Length with inch: "44 inch" or "44inch"
        new RegExp(`${cleanAcceptable.replace(/[+\-\.]/g, '\\$&')}\\s*inch`, 'i'),
        // Length with space before and quote after: " 44\""
        new RegExp(`\\s${cleanAcceptable.replace(/[+\-\.]/g, '\\$&')}"`, 'i'),
        // Length at start with quote: "44\" driver"
        new RegExp(`^${cleanAcceptable.replace(/[+\-\.]/g, '\\$&')}"`, 'i'),
      ];
      
      if (patterns.some(pattern => pattern.test(titleLower))) {
        console.log(`  ✅ TITLE MATCH: "${title}" contains "${acceptableLength}"`);
        return true;
      }
    }
    
    // Strategy 3: Special handling for "Standard" or "Standard Length"
    if (acceptableLength === 'Standard' || acceptableLength === 'Standard Length') {
      if (tags.some(tag => tag.toLowerCase() === 'standard' || tag.toLowerCase() === 'standard length')) {
        console.log(`  ✅ STANDARD MATCH in tags`);
        return true;
      }
      
      if (/\bstandard\s+length\b/i.test(titleLower) || 
          /\bstandard\b/i.test(titleLower)) {
        console.log(`  ✅ STANDARD MATCH in title`);
        return true;
      }
    }
    
    return false;
  });
  
  if (!hasMatch) {
    console.log(`  ❌ NO MATCH found for acceptable lengths: ${acceptableLengths.join(', ')}`);
  }
  
  return hasMatch;
}

function findBestMatches(products, categoryTag, profile, limit = 12) {
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
    
    // HARD FILTER #1: HANDEDNESS - More lenient approach
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
        tag.toLowerCase().includes('lh ') ||
        tag === 'handedness_left' ||
        tag.toLowerCase() === 'left'
      ) || p.title.toLowerCase().includes('left hand') ||
           p.title.toLowerCase().includes('left-hand') ||
           p.title.toLowerCase().includes(' lh ') ||
           p.title.toLowerCase().includes('lefty');
      
      handednessMatch = !isExplicitlyLeftHanded; // Show if NOT explicitly left-handed
    }
    
    // If handedness doesn't match, this club is ELIMINATED - return false immediately
    if (!handednessMatch) {
      return false;
    }
    
    // HARD FILTER #2: GENDER - More lenient approach
    let genderMatch = true;
    const titleLower = p.title.toLowerCase();
    const tagsLower = p.tags.map(t => t.toLowerCase());
    
    // Check if product is explicitly women's/ladies
    const isExplicitlyWomens = tagsLower.some(tag => 
      tag.includes('women') || 
      tag.includes('ladies') || 
      tag.includes('female') ||
      tag.includes('lady')
    ) || titleLower.includes('women') || 
        titleLower.includes('ladies') || 
        titleLower.includes('lady');
    
    // Check if product is explicitly men's
    const isExplicitlyMens = tagsLower.some(tag => 
      tag.includes("men's") || 
      tag === 'gender_male'
    ) || titleLower.includes("men's only");
    
    if (profile.gender === 'male') {
      // For men: Only exclude if EXPLICITLY women's/ladies
      genderMatch = !isExplicitlyWomens;
    } else if (profile.gender === 'female') {
      // For women: Show women's items, or unisex if they exist
      genderMatch = isExplicitlyWomens || (!isExplicitlyMens && !isExplicitlyWomens);
    } else if (profile.gender === 'unisex') {
      // For unisex: Show everything except explicitly gendered
      genderMatch = true; // Show all for now
    }
    
    // Additional flex-based gender filtering for edge cases (NOT for wedges)
    if (categoryTag !== 'Wedges' && (profile.flex === 'stiff' || profile.flex === 'extra-stiff')) {
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
    
    // HARD FILTER #3: BUDGET - Over budget = ELIMINATED
    const withinBudget = p.price <= profile.budget;

    if (!withinBudget) {
      return false; // Over budget, ELIMINATED
    }

    // HARD FILTER #4: HEIGHT/LENGTH - Only for Drivers and Iron Sets AND only for males
    if ((categoryTag === 'Drivers' || categoryTag === 'Iron Sets') && profile.gender === 'male') {
      const acceptableLengths = getAcceptableLengths(profile.height, categoryTag);
      
      if (acceptableLengths) {
        const lengthMatch = checkLengthMatch(p, acceptableLengths);
        
        if (!lengthMatch) {
          console.log(`❌ Height filter eliminated: ${p.title} - looking for ${acceptableLengths.join(', ')}`);
          return false; // Wrong length for height, ELIMINATED
        } else {
          console.log(`✅ Height filter passed: ${p.title}`);
        }
      }
    }

    // Only clubs that pass ALL filters reach this point
    return hasCategory && inStock;
  });

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

  // Sort by score DESC, then by price DESC (expensive first when tied)
  const sorted = scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score; // Higher score first
    }
    return b.price - a.price; // If tied, HIGHER price first (better condition)
  });
  
  return sorted.slice(0, limit);
}

function scoreClub(club, profile, categoryTag) {
  // NOTE: This function only scores clubs that already passed gender/handedness filters
  // Gender and handedness mismatches have already been ELIMINATED
  
  let score = 0;
  const handicapValue = parseHandicap(profile.handicap);
  
  // ===================================
  // PRIORITY 1: FLEX MATCH (Highest weight - 100 points)
  // SKIP FOR WEDGES - Wedges don't need flex matching
  // ===================================
  if (categoryTag !== 'Wedges') {
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
  }

  // ===================================
  // PRIORITY 2: SKILL LEVEL MATCH (Second priority - 75 points)
  // SKIP FOR WEDGES - Wedges don't need skill level matching
  // ===================================
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
      score += 75; // Perfect skill level match - SECOND PRIORITY
    } else {
      const hasAnySkill = club.tags.some(tag => 
        tag.toLowerCase().includes('forgiveness') ||
        tag.toLowerCase().includes('precision') ||
        tag.toLowerCase().includes('control')
      );
      if (hasAnySkill) {
        score += 35; // Has some skill tag, but not ideal
      }
    }
  }

  // ===================================
  // PRIORITY 3: BRAND PREFERENCE (Third priority - 50 points)
  // ===================================
  if (profile.brandPreferences && profile.brandPreferences.length > 0) {
    const normalizedClubBrand = club.brand.trim().toLowerCase();
    const matchesBrand = profile.brandPreferences.some(prefBrand => 
      normalizedClubBrand === prefBrand.trim().toLowerCase() ||
      normalizedClubBrand.includes(prefBrand.trim().toLowerCase())
    );
    
    if (matchesBrand) {
      score += 50; // User's preferred brand - THIRD PRIORITY
    }
  }

  // ===================================
  // PRICE BONUS (Minor bonus for using budget - 0-10 points)
  // Only give bonus to items WITHIN budget
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

function generateMatchReason(club, profile, score, categoryTag) {
  const reasons = [];
  const handicapValue = parseHandicap(profile.handicap);
  
  // Show flex match first since it's priority #1 (SKIP for wedges)
  if (categoryTag !== 'Wedges') {
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
  }
  
  // Then show skill level match (SKIP for wedges)
  if (categoryTag !== 'Wedges') {
    if (handicapValue <= 10 && club.tags.some(tag => tag.toLowerCase().includes('precision'))) {
      reasons.push("Tour-level precision");
    } else if (handicapValue > 10 && handicapValue <= 20 && club.tags.some(tag => tag.toLowerCase().includes('control'))) {
      reasons.push("Great control & distance");
    } else if (handicapValue > 20 && club.tags.some(tag => tag.toLowerCase().includes('forgiveness'))) {
      reasons.push("Maximum forgiveness");
    }
  }
  
  if (club.price <= profile.budget * 0.9) {
    reasons.push("Excellent value");
  } else if (club.price <= profile.budget) {
    reasons.push("Within budget");
  }
  
  // Check brand preference with same normalization as scoring
  if (profile.brandPreferences && profile.brandPreferences.length > 0) {
    const normalizedClubBrand = club.brand.trim().toLowerCase();
    const matchesBrand = profile.brandPreferences.some(prefBrand => 
      normalizedClubBrand === prefBrand.trim().toLowerCase() ||
      normalizedClubBrand.includes(prefBrand.trim().toLowerCase())
    );
    
    if (matchesBrand) {
      reasons.push("⭐ Your preferred brand");
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