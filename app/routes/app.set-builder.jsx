import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Badge,
  Spinner,
  ProgressBar,
} from "@shopify/polaris";

export default function SetBuilder() {
  const [step, setStep] = useState(0);
  const [categoryStep, setCategoryStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [profile, setProfile] = useState({
    handicap: '',
    budget: 1000,
    brandPreferences: [],
    swingSpeed: '',
    flex: '',
    gender: 'male',
  });
  const [recommendations, setRecommendations] = useState(null);
  const [selectedClubs, setSelectedClubs] = useState({});

  const handicapOptions = [
    { label: 'Select handicap', value: '' },
    { label: '0-10 (Low handicap)', value: '0-10' },
    { label: '10-20 (Mid handicap)', value: '10-20' },
    { label: '20-30 (High handicap)', value: '20-30' },
    { label: '30+ (Beginner)', value: '30+' },
  ];

  const swingSpeedOptions = [
    { label: 'Select swing speed', value: '' },
    { label: 'Slow', value: 'slow' },
    { label: 'Moderate', value: 'moderate' },
    { label: 'Fast', value: 'fast' },
  ];

  const flexOptions = [
    { label: 'Not sure / Let us decide', value: '' },
    { label: 'Senior Flex (A)', value: 'senior' },
    { label: 'Regular Flex (R)', value: 'regular' },
    { label: 'Stiff Flex (S)', value: 'stiff' },
    { label: 'Extra Stiff (X)', value: 'extra-stiff' },
  ];

  const genderOptions = [
    { label: 'Men\'s', value: 'male' },
    { label: 'Women\'s', value: 'female' },
    { label: 'Either / Unisex', value: 'unisex' },
  ];

  const brandOptions = [
    { label: 'Callaway', value: 'Callaway' },
    { label: 'TaylorMade', value: 'TaylorMade' },
    { label: 'Titleist', value: 'Titleist' },
    { label: 'Ping', value: 'Ping' },
    { label: 'Mizuno', value: 'Mizuno' },
    { label: 'Cobra', value: 'Cobra' },
  ];

  const categories = [
    { key: 'driver', label: 'Driver', description: 'Your most important club off the tee' },
    { key: 'woods', label: 'Fairway Woods', description: 'For long shots from the fairway' },
    { key: 'hybrids', label: 'Hybrids', description: 'Easier to hit than long irons' },
    { key: 'irons', label: 'Irons', description: 'Your most versatile clubs' },
    { key: 'wedges', label: 'Wedges', description: 'For precision around the green' },
    { key: 'putter', label: 'Putter', description: 'The most important club in your bag' },
  ];

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      console.log('Fetching recommendations with profile:', profile);
      
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Recommendations data:', data);
      
      setRecommendations(data.recommendations);
      setStep(2);
      setCategoryStep(0);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      alert(`Error loading recommendations: ${error.message}. Check the console for details.`);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };
const handleCheckout = async () => {
  if (Object.keys(selectedClubs).length === 0) {
    alert('Please select at least one club before adding to cart');
    return;
  }

  setCheckoutLoading(true);
  
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedClubs
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to prepare cart items');
    }

    console.log('Cart items prepared:', data.items);

    // Add items to cart using Shopify's Ajax API
    const formData = {
      items: data.items.map(item => {
        const numericId = item.id.split('/').pop(); // Extract numeric ID from GID
        console.log('Adding to cart:', numericId, item.title);
        return {
          id: numericId,
          quantity: 1
        };
      })
    };

    console.log('Sending to cart:', formData);

    const cartResponse = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });

    if (!cartResponse.ok) {
      const errorText = await cartResponse.text();
      console.error('Cart API error:', errorText);
      throw new Error('Failed to add items to cart');
    }

    const cartData = await cartResponse.json();
    console.log('Cart response:', cartData);

    // Redirect to cart page
    window.location.href = '/cart';

  } catch (error) {
    console.error('Error adding to cart:', error);
    alert(`Error adding to cart: ${error.message}`);
  } finally {
    setCheckoutLoading(false);
  }
};

  const handleFindClubs = () => {
    if (!profile.handicap || !profile.budget || !profile.swingSpeed) {
      alert('Please fill out all required fields');
      return;
    }
    setStep(1);
    fetchRecommendations();
  };

  const handleSelectClub = (club) => {
    const currentCategory = categories[categoryStep].key;
    setSelectedClubs({...selectedClubs, [currentCategory]: club});
  };

  const handleSkipCategory = () => {
    const currentCategory = categories[categoryStep].key;
    const newSelected = {...selectedClubs};
    delete newSelected[currentCategory];
    setSelectedClubs(newSelected);
    handleNextCategory();
  };

  const handleNextCategory = () => {
    if (categoryStep < categories.length - 1) {
      setCategoryStep(categoryStep + 1);
    } else {
      setStep(3);
    }
  };

  const handlePreviousCategory = () => {
    if (categoryStep > 0) {
      setCategoryStep(categoryStep - 1);
    }
  };

  const totalPrice = Object.values(selectedClubs).reduce((sum, club) => sum + (club?.price || 0), 0);
  const clubCount = Object.keys(selectedClubs).length;
  const progressPercent = ((categoryStep + 1) / categories.length) * 100;

  const currentCategory = categories[categoryStep];
  const currentOptions = recommendations ? recommendations[currentCategory.key] || [] : [];
  const currentSelection = selectedClubs[currentCategory.key];

  return (
    <Page title="Golf Set Builder">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* STEP 0: QUESTIONNAIRE */}
              {step === 0 && (
                <>
                  <Text variant="headingLg">Build Your Perfect Golf Set</Text>
                  <BlockStack gap="400">
                    <Text>Answer a few questions and we'll match you with the perfect preowned clubs!</Text>
                    
                    <Select
                      label="What's your handicap? *"
                      options={handicapOptions}
                      value={profile.handicap}
                      onChange={(value) => setProfile({...profile, handicap: value})}
                    />

                    <TextField
                      label="Total Budget ($) *"
                      type="number"
                      value={profile.budget.toString()}
                      onChange={(value) => setProfile({...profile, budget: parseInt(value) || 0})}
                      prefix="$"
                      helpText="How much do you want to spend on your complete set?"
                    />

                    <Select
                      label="Swing Speed *"
                      options={swingSpeedOptions}
                      value={profile.swingSpeed}
                      onChange={(value) => setProfile({...profile, swingSpeed: value})}
                      helpText="This helps us recommend the right shaft flex"
                    />

                    <Select
                      label="Shaft Flex (if known)"
                      options={flexOptions}
                      value={profile.flex}
                      onChange={(value) => setProfile({...profile, flex: value})}
                      helpText="Leave blank if you're not sure - we'll recommend based on swing speed"
                    />

                    <Select
                      label="Gender"
                      options={genderOptions}
                      value={profile.gender}
                      onChange={(value) => setProfile({...profile, gender: value})}
                    />

                    <div>
                      <Text variant="bodyMd" fontWeight="medium">Brand Preferences (optional)</Text>
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {brandOptions.map(brand => (
                          <Button
                            key={brand.value}
                            size="slim"
                            onClick={() => {
                              const current = profile.brandPreferences || [];
                              if (current.includes(brand.value)) {
                                setProfile({
                                  ...profile,
                                  brandPreferences: current.filter(b => b !== brand.value)
                                });
                              } else {
                                setProfile({
                                  ...profile,
                                  brandPreferences: [...current, brand.value]
                                });
                              }
                            }}
                            variant={profile.brandPreferences?.includes(brand.value) ? 'primary' : undefined}
                          >
                            {brand.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <InlineStack gap="200">
                      <Button variant="primary" onClick={handleFindClubs}>
                        Find My Clubs
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </>
              )}

              {/* STEP 1: LOADING */}
              {step === 1 && (
                <BlockStack gap="400" align="center">
                  <Spinner size="large" />
                  <Text variant="headingMd">Finding your perfect clubs...</Text>
                  <Text>Analyzing your profile and matching with our inventory</Text>
                </BlockStack>
              )}

              {/* STEP 2: CATEGORY-BY-CATEGORY SELECTION */}
              {step === 2 && recommendations && (
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="headingSm">Step {categoryStep + 1} of {categories.length}</Text>
                      <Text variant="bodySm" tone="subdued">
                        {clubCount} clubs selected | ${totalPrice.toFixed(2)} of ${profile.budget}
                      </Text>
                    </InlineStack>
                    <ProgressBar progress={progressPercent} size="small" />
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text variant="headingLg">{currentCategory.label}</Text>
                    <Text tone="subdued">{currentCategory.description}</Text>
                  </BlockStack>

                  {currentOptions.length === 0 ? (
                    <Card>
                      <BlockStack gap="300">
                        <Text variant="headingMd">No {currentCategory.label} Available</Text>
                        <Text>We don't have any {currentCategory.label.toLowerCase()} in stock that match your criteria right now.</Text>
                        <InlineStack gap="200">
                          {categoryStep > 0 && (
                            <Button onClick={handlePreviousCategory}>
                              ← Back
                            </Button>
                          )}
                          <Button variant="primary" onClick={handleNextCategory}>
                            Continue →
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  ) : (
                    <BlockStack gap="300">
                      {currentSelection && (
                        <Card background="bg-surface-success">
                          <BlockStack gap="300">
                            <Badge tone="success">✓ Your Selection</Badge>
                            <InlineGrid columns={['oneThird', 'twoThirds']} gap="400">
                              <div>
                                {currentSelection.image && (
                                  <img 
                                    src={currentSelection.image} 
                                    alt={currentSelection.title}
                                    style={{ width: '100%', height: '150px', objectFit: 'contain' }}
                                  />
                                )}
                              </div>
                              <BlockStack gap="200">
                                <Text variant="headingMd">{currentSelection.title}</Text>
                                <Text variant="headingLg">${currentSelection.price}</Text>
                                <InlineStack gap="200">
                                  <Badge>{currentSelection.brand}</Badge>
                                </InlineStack>
                                <Text variant="bodySm" tone="subdued">{currentSelection.matchReason}</Text>
                              </BlockStack>
                            </InlineGrid>
                          </BlockStack>
                        </Card>
                      )}

                      <Text variant="headingMd">
                        {currentSelection ? 'Other Options' : 'Choose Your ' + currentCategory.label}
                      </Text>
                      
                      {currentOptions.map((club, idx) => (
                        <Card 
                          key={idx}
                          background={currentSelection?.id === club.id ? "bg-surface-active" : undefined}
                        >
                          <InlineGrid columns={['oneThird', 'twoThirds']} gap="400">
                            <div>
                              {club.image && (
                                <img 
                                  src={club.image} 
                                  alt={club.title}
                                  style={{ width: '100%', height: '120px', objectFit: 'contain' }}
                                />
                              )}
                            </div>
                            <BlockStack gap="200">
                              <Text variant="headingMd">{club.title}</Text>
                              <Text variant="headingLg">${club.price}</Text>
                              <InlineStack gap="200">
                                <Badge>{club.brand}</Badge>
                                {idx === 0 && !currentSelection && club.score >= 60 && (
                                  <Badge tone="info">Recommended</Badge>
                                )}
                              </InlineStack>
                              <Text variant="bodySm" tone="subdued">{club.matchReason}</Text>
                              <Button
                                variant={currentSelection?.id === club.id ? "primary" : undefined}
                                onClick={() => handleSelectClub(club)}
                              >
                                {currentSelection?.id === club.id ? '✓ Selected' : 'Select This Club'}
                              </Button>
                            </BlockStack>
                          </InlineGrid>
                        </Card>
                      ))}

                      <Card>
                        <InlineStack align="space-between" gap="200">
                          <InlineStack gap="200">
                            {categoryStep > 0 && (
                              <Button onClick={handlePreviousCategory}>
                                ← Back
                              </Button>
                            )}
                            <Button onClick={handleSkipCategory}>
                              Skip {currentCategory.label}
                            </Button>
                          </InlineStack>
                          <Button 
                            variant="primary" 
                            onClick={handleNextCategory}
                          >
                            {currentSelection ? 'Continue →' : 'Skip & Continue →'}
                          </Button>
                        </InlineStack>
                      </Card>
                    </BlockStack>
                  )}
                </BlockStack>
              )}

              {/* STEP 3: FINAL REVIEW */}
              {step === 3 && (
                <BlockStack gap="400">
                  <Text variant="headingLg">Review Your Complete Set</Text>

                  <Card background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodyLg" fontWeight="semibold">Total Price:</Text>
                        <Text variant="headingLg">${totalPrice.toFixed(2)}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text>Your Budget:</Text>
                        <Text>${profile.budget}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text>Total Clubs:</Text>
                        <Text>{clubCount} clubs</Text>
                      </InlineStack>
                      {totalPrice <= profile.budget ? (
                        <Badge tone="success">✓ Under Budget by ${(profile.budget - totalPrice).toFixed(2)}</Badge>
                      ) : (
                        <Badge tone="warning">Over Budget by ${(totalPrice - profile.budget).toFixed(2)}</Badge>
                      )}
                    </BlockStack>
                  </Card>

                  <BlockStack gap="300">
                    <Text variant="headingMd">Your Selected Clubs</Text>
                    {clubCount === 0 ? (
                      <Card>
                        <Text>You haven't selected any clubs yet. Go back and select at least one club.</Text>
                      </Card>
                    ) : (
                      Object.entries(selectedClubs).map(([category, club]) => (
                        <Card key={category}>
                          <InlineGrid columns={['oneQuarter', 'threeQuarters']} gap="400">
                            <div>
                              {club.image && (
                                <img 
                                  src={club.image} 
                                  alt={club.title}
                                  style={{ width: '100%', height: '100px', objectFit: 'contain' }}
                                />
                              )}
                            </div>
                            <BlockStack gap="200">
                              <Text variant="bodySm" tone="subdued">
                                {categories.find(c => c.key === category)?.label}
                              </Text>
                              <Text variant="headingSm">{club.title}</Text>
                              <InlineStack gap="200">
                                <Text variant="bodyLg" fontWeight="semibold">${club.price}</Text>
                                <Badge>{club.brand}</Badge>
                              </InlineStack>
                            </BlockStack>
                          </InlineGrid>
                        </Card>
                      ))
                    )}
                  </BlockStack>

                  <Card>
                    <InlineStack align="space-between" gap="200">
                      <Button onClick={() => {
                        setStep(2);
                        setCategoryStep(0);
                      }}>
                        ← Edit Selections
                      </Button>
                      <InlineStack gap="200">
                        <Button onClick={() => {
                          setStep(0);
                          setRecommendations(null);
                          setSelectedClubs({});
                          setCategoryStep(0);
                        }}>
                          Start Over
                        </Button>
                        <Button 
                          variant="primary" 
                          onClick={handleCheckout}
                          loading={checkoutLoading}
                          disabled={clubCount === 0}
                        >
                          Add to Cart
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}