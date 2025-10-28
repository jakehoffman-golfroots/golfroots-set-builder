import { useState } from "react";

export async function loader({ request }) {
  // This route is accessed via the storefront app proxy
  // URL will be: yourstore.com/apps/set-builder
  return null;
}

export default function StorefrontSetBuilder() {
  const [step, setStep] = useState(0);
  const [categoryStep, setCategoryStep] = useState(0);
  const [loading, setLoading] = useState(false);
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
      const response = await fetch('/apps/set-builder/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setRecommendations(data.recommendations);
      setStep(2);
      setCategoryStep(0);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      alert(`Error loading recommendations: ${error.message}`);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async () => {
    if (Object.keys(selectedClubs).length === 0) {
      alert('Please select at least one club');
      return;
    }

    try {
      // Use Shopify's Ajax Cart API
      const items = Object.values(selectedClubs).map(club => ({
        id: club.variantId.split('/').pop(),
        quantity: 1
      }));

      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });

      if (response.ok) {
        // Redirect to cart
        window.location.href = '/cart';
      } else {
        throw new Error('Failed to add to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Error adding to cart. Please try again.');
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* STEP 0: QUESTIONNAIRE */}
      {step === 0 && (
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Build Your Perfect Golf Set</h1>
          <p style={{ color: '#666', marginBottom: '30px' }}>Answer a few questions and we'll match you with the perfect preowned clubs!</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>What's your handicap? *</label>
              <select 
                value={profile.handicap}
                onChange={(e) => setProfile({...profile, handicap: e.target.value})}
                style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                {handicapOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Total Budget ($) *</label>
              <input
                type="number"
                value={profile.budget}
                onChange={(e) => setProfile({...profile, budget: parseInt(e.target.value) || 0})}
                style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <small style={{ color: '#666' }}>How much do you want to spend on your complete set?</small>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Swing Speed *</label>
              <select 
                value={profile.swingSpeed}
                onChange={(e) => setProfile({...profile, swingSpeed: e.target.value})}
                style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                {swingSpeedOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <small style={{ color: '#666' }}>This helps us recommend the right shaft flex</small>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Shaft Flex (if known)</label>
              <select 
                value={profile.flex}
                onChange={(e) => setProfile({...profile, flex: e.target.value})}
                style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                {flexOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Gender</label>
              <select 
                value={profile.gender}
                onChange={(e) => setProfile({...profile, gender: e.target.value})}
                style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                {genderOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Brand Preferences (optional)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {brandOptions.map(brand => (
                  <button
                    key={brand.value}
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
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      background: profile.brandPreferences?.includes(brand.value) ? '#000' : '#fff',
                      color: profile.brandPreferences?.includes(brand.value) ? '#fff' : '#000',
                      cursor: 'pointer'
                    }}
                  >
                    {brand.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleFindClubs}
              style={{
                padding: '16px 32px',
                fontSize: '18px',
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Find My Clubs
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: LOADING */}
      {step === 1 && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>Finding your perfect clubs...</div>
          <div>Analyzing your profile and matching with our inventory</div>
        </div>
      )}

      {/* STEP 2: CATEGORY SELECTION */}
      {step === 2 && recommendations && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', color: '#666' }}>
              <span>Step {categoryStep + 1} of {categories.length}</span>
              <span>{clubCount} clubs selected | ${totalPrice.toFixed(2)} of ${profile.budget}</span>
            </div>
            <div style={{ height: '4px', background: '#eee', borderRadius: '2px' }}>
              <div style={{ height: '100%', background: '#000', width: `${progressPercent}%`, borderRadius: '2px', transition: 'width 0.3s' }}></div>
            </div>
          </div>

          <h2 style={{ fontSize: '28px', marginBottom: '8px' }}>{currentCategory.label}</h2>
          <p style={{ color: '#666', marginBottom: '30px' }}>{currentCategory.description}</p>

          {currentOptions.length === 0 ? (
            <div style={{ padding: '40px', border: '1px solid #ddd', borderRadius: '8px', textAlign: 'center' }}>
              <h3>No {currentCategory.label} Available</h3>
              <p>We don't have any {currentCategory.label.toLowerCase()} in stock right now.</p>
              <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                {categoryStep > 0 && (
                  <button onClick={handlePreviousCategory} style={{ padding: '12px 24px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>
                    ← Back
                  </button>
                )}
                <button onClick={handleNextCategory} style={{ padding: '12px 24px', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Continue →
                </button>
              </div>
            </div>
          ) : (
            <div>
              {currentSelection && (
                <div style={{ padding: '20px', border: '2px solid #4caf50', borderRadius: '8px', marginBottom: '20px', background: '#f0fff0' }}>
                  <div style={{ fontSize: '14px', color: '#4caf50', fontWeight: '600', marginBottom: '15px' }}>✓ Your Selection</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px' }}>
                    <img src={currentSelection.image} alt={currentSelection.title} style={{ width: '100%', height: '150px', objectFit: 'contain' }} />
                    <div>
                      <h3 style={{ fontSize: '20px', marginBottom: '10px' }}>{currentSelection.title}</h3>
                      <div style={{ fontSize: '24px', fontWeight: '600', marginBottom: '10px' }}>${currentSelection.price}</div>
                      <div style={{ marginBottom: '10px' }}><span style={{ padding: '4px 12px', background: '#000', color: '#fff', borderRadius: '4px', fontSize: '14px' }}>{currentSelection.brand}</span></div>
                      <p style={{ color: '#666', fontSize: '14px' }}>{currentSelection.matchReason}</p>
                    </div>
                  </div>
                </div>
              )}

              <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
                {currentSelection ? 'Other Options' : 'Choose Your ' + currentCategory.label}
              </h3>

              {currentOptions.map((club, idx) => (
                <div 
                  key={idx}
                  style={{ 
                    padding: '20px', 
                    border: '1px solid #ddd', 
                    borderRadius: '8px', 
                    marginBottom: '15px',
                    background: currentSelection?.id === club.id ? '#f5f5f5' : '#fff'
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px' }}>
                    <img src={club.image} alt={club.title} style={{ width: '100%', height: '120px', objectFit: 'contain' }} />
                    <div>
                      <h4 style={{ fontSize: '18px', marginBottom: '8px' }}>{club.title}</h4>
                      <div style={{ fontSize: '22px', fontWeight: '600', marginBottom: '10px' }}>${club.price}</div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ padding: '4px 12px', background: '#000', color: '#fff', borderRadius: '4px', fontSize: '14px' }}>{club.brand}</span>
                        {idx === 0 && !currentSelection && club.score >= 60 && (
                          <span style={{ padding: '4px 12px', background: '#2196F3', color: '#fff', borderRadius: '4px', fontSize: '14px' }}>Recommended</span>
                        )}
                      </div>
                      <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>{club.matchReason}</p>
                      <button
                        onClick={() => handleSelectClub(club)}
                        style={{
                          padding: '10px 20px',
                          background: currentSelection?.id === club.id ? '#4caf50' : '#000',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}
                      >
                        {currentSelection?.id === club.id ? '✓ Selected' : 'Select This Club'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {categoryStep > 0 && (
                    <button onClick={handlePreviousCategory} style={{ padding: '12px 24px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>
                      ← Back
                    </button>
                  )}
                  <button onClick={handleSkipCategory} style={{ padding: '12px 24px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>
                    Skip {currentCategory.label}
                  </button>
                </div>
                <button onClick={handleNextCategory} style={{ padding: '12px 24px', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>
                  {currentSelection ? 'Continue →' : 'Skip & Continue →'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: FINAL REVIEW */}
      {step === 3 && (
        <div>
          <h2 style={{ fontSize: '32px', marginBottom: '30px' }}>Review Your Complete Set</h2>

          <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '30px', background: '#f9f9f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <span style={{ fontSize: '18px', fontWeight: '600' }}>Total Price:</span>
              <span style={{ fontSize: '28px', fontWeight: '600' }}>${totalPrice.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span>Your Budget:</span>
              <span>${profile.budget}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <span>Total Clubs:</span>
              <span>{clubCount} clubs</span>
            </div>
            {totalPrice <= profile.budget ? (
              <div style={{ padding: '8px 16px', background: '#4caf50', color: '#fff', borderRadius: '4px', textAlign: 'center' }}>
                ✓ Under Budget by ${(profile.budget - totalPrice).toFixed(2)}
              </div>
            ) : (
              <div style={{ padding: '8px 16px', background: '#ff9800', color: '#fff', borderRadius: '4px', textAlign: 'center' }}>
                Over Budget by ${(totalPrice - profile.budget).toFixed(2)}
              </div>
            )}
          </div>

          <h3 style={{ fontSize: '24px', marginBottom: '20px' }}>Your Selected Clubs</h3>

          {clubCount === 0 ? (
            <div style={{ padding: '40px', border: '1px solid #ddd', borderRadius: '8px', textAlign: 'center' }}>
              <p>You haven't selected any clubs yet. Go back and select at least one club.</p>
            </div>
          ) : (
            Object.entries(selectedClubs).map(([category, club]) => (
              <div key={category} style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '20px' }}>
                  <img src={club.image} alt={club.title} style={{ width: '100%', height: '100px', objectFit: 'contain' }} />
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                      {categories.find(c => c.key === category)?.label}
                    </div>
                    <h4 style={{ fontSize: '18px', marginBottom: '8px' }}>{club.title}</h4>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '20px', fontWeight: '600' }}>${club.price}</span>
                      <span style={{ padding: '4px 12px', background: '#000', color: '#fff', borderRadius: '4px', fontSize: '14px' }}>{club.brand}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
            <button 
              onClick={() => { setStep(2); setCategoryStep(0); }}
              style={{ padding: '14px 28px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '16px' }}
            >
              ← Edit Selections
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => {
                  setStep(0);
                  setRecommendations(null);
                  setSelectedClubs({});
                  setCategoryStep(0);
                }}
                style={{ padding: '14px 28px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '16px' }}
              >
                Start Over
              </button>
              <button 
                onClick={handleAddToCart}
                disabled={clubCount === 0}
                style={{
                  padding: '14px 28px',
                  background: clubCount === 0 ? '#ccc' : '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: clubCount === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: '600'
                }}
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
