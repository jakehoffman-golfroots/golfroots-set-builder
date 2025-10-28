import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  
  const { selectedClubs } = body;

  try {
    console.log('Adding items to cart:', selectedClubs);

    // Extract variant IDs for the response
    const cartItems = Object.values(selectedClubs).map(club => ({
      id: club.variantId,
      quantity: 1,
      title: club.title,
      price: club.price,
      image: club.image
    }));

    return Response.json({ 
      success: true,
      items: cartItems
    });

  } catch (error) {
    console.error('Error preparing cart items:', error);
    return Response.json({ 
      error: 'Failed to prepare cart items: ' + error.message 
    }, { status: 500 });
  }
}