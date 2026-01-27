/**
 * Stripe Integration
 * Handles payment processing for GardenBuddy Pro upgrades
 */

// Initialize Stripe (publishable key safe for frontend)
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY_HERE'; // Replace with your key
const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);

// Price IDs (from Stripe Dashboard)
const PRICES = {
  CONSUMER_PRO_MONTHLY: 'price_xxxxx',
  CONSUMER_PRO_YEARLY: 'price_xxxxx',
  CONTRACTOR_STANDARD: 'price_xxxxx',
  CONTRACTOR_PROFESSIONAL: 'price_xxxxx',
  CONTRACTOR_ENTERPRISE: 'price_xxxxx'
};

/**
 * Upgrade to Pro (Consumer)
 * @param {string} userEmail - User's email
 * @param {string} userId - User's ID (optional)
 * @param {string} plan - 'monthly' or 'yearly'
 */
async function upgradeToP

ro(userEmail, userId = null, plan = 'monthly') {
  try {
    console.log('Starting upgrade to Pro:', { userEmail, userId, plan });
    
    // Determine price ID
    const priceId = plan === 'yearly' 
      ? PRICES.CONSUMER_PRO_YEARLY 
      : PRICES.CONSUMER_PRO_MONTHLY;
    
    // Call backend to create checkout session
    const response = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId: priceId,
        userEmail: userEmail,
        userId: userId || 'guest',
        plan: 'consumer_pro_' + plan,
        returnUrl: window.location.href
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || 'Failed to create checkout session');
    }
    
    const { sessionId, url } = await response.json();
    
    console.log('Checkout session created:', sessionId);
    
    // Redirect to Stripe Checkout
    window.location.href = url;
    
  } catch (error) {
    console.error('Upgrade error:', error);
    alert('Failed to start checkout. Please try again.');
  }
}

/**
 * Upgrade Contractor Plan
 * @param {string} userEmail - Contractor email
 * @param {string} userId - Contractor ID
 * @param {string} tier - 'standard', 'professional', or 'enterprise'
 */
async function upgradeContractorPlan(userEmail, userId, tier) {
  try {
    const priceId = PRICES[`CONTRACTOR_${tier.toUpperCase()}`];
    
    if (!priceId) {
      throw new Error('Invalid tier: ' + tier);
    }
    
    const response = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId: priceId,
        userEmail: userEmail,
        userId: userId,
        plan: 'contractor_' + tier,
        returnUrl: window.location.href
      })
    });
    
    const { url } = await response.json();
    window.location.href = url;
    
  } catch (error) {
    console.error('Contractor upgrade error:', error);
    alert('Failed to start checkout. Please try again.');
  }
}

/**
 * Manage Subscription (Customer Portal)
 * @param {string} customerId - Stripe customer ID
 */
async function manageSubscription(customerId) {
  try {
    const response = await fetch('/api/create-portal-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: customerId,
        returnUrl: window.location.href
      })
    });
    
    const { url } = await response.json();
    window.location.href = url;
    
  } catch (error) {
    console.error('Portal error:', error);
    alert('Failed to open subscription management.');
  }
}

/**
 * Check subscription status after redirect
 */
async function checkSubscriptionStatus(userId) {
  try {
    const response = await fetch(`/api/subscription-status/${userId}`);
    const status = await response.json();
    
    return status;
    
  } catch (error) {
    console.error('Status check error:', error);
    return { isPro: false, plan: 'free' };
  }
}

/**
 * Handle successful payment redirect
 * Call this on success page
 */
async function handlePaymentSuccess() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  
  if (!sessionId) {
    console.log('No session ID found');
    return;
  }
  
  try {
    // Get session details
    const response = await fetch(`/api/checkout-session/${sessionId}`);
    const session = await response.json();
    
    console.log('Payment successful:', session);
    
    // Update local storage
    const currentUser = JSON.parse(localStorage.getItem('gardenMemory') || '{}');
    currentUser.isPro = true;
    currentUser.plan = session.metadata.plan;
    localStorage.setItem('gardenMemory', JSON.stringify(currentUser));
    
    // Show success message
    showSuccessMessage('Welcome to Pro! 🎉');
    
    // Redirect to app after 2 seconds
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
    
  } catch (error) {
    console.error('Success handler error:', error);
  }
}

function showSuccessMessage(message) {
  // Create success modal or toast
  const successDiv = document.createElement('div');
  successDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 2rem;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
    z-index: 10000;
    text-align: center;
    font-size: 1.5rem;
  `;
  successDiv.textContent = message;
  document.body.appendChild(successDiv);
}