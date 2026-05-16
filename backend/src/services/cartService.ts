import { prisma } from "../lib/prisma.js";

// Get or create the retailer's cart
async function getOrCreateCart(retailerId: string) {
  let cart = await prisma.cart.findUnique({
    where: { retailerId },
    include: {
      items: {
        include: {
          partListing: {
            include: {
              part: true,
              wholesaler: { select: { id: true, companyName: true } },
            },
          },
        },
      },
      discountCode: true,
    },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { retailerId },
      include: {
        items: {
          include: {
            partListing: {
              include: {
                part: true,
                wholesaler: { select: { id: true, companyName: true } },
              },
            },
          },
        },
        discountCode: true,
      },
    });
  }

  return cart;
}

export async function getCart(retailerId: string) {
  return getOrCreateCart(retailerId);
}

export async function addToCart(
  retailerId: string,
  partListingId: string,
  quantity: number
) {
  const cart = await getOrCreateCart(retailerId);

  const listing = await prisma.partListing.findUnique({
    where: { id: partListingId },
  });
  if (!listing) throw new Error("Listing not found");

  // Check if item already in cart — if so, update quantity
  const existing = await prisma.cartItem.findUnique({
    where: {
      cartId_partListingId: {
        cartId: cart.id,
        partListingId,
      },
    },
  });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        partListingId,
        quantity,
        unitPrice: listing.price,
        currency: listing.currency,
      },
    });
  }

  return getCart(retailerId);
}

export async function updateCartItem(
  retailerId: string,
  itemId: string,
  quantity: number
) {
  const cart = await getOrCreateCart(retailerId);

  // Update the quantity directly — flexible for adjustments.
  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });

  return getCart(retailerId);
}

export async function removeFromCart(retailerId: string, itemId: string) {
  await prisma.cartItem.delete({ where: { id: itemId } });
  return getCart(retailerId);
}

export async function clearCart(retailerId: string) {
  const cart = await getOrCreateCart(retailerId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: null },
  });
  return getCart(retailerId);
}

// Apply discount code to the cart.
// Validates code exists and is active; increments usedCount.
export async function applyDiscountCode(retailerId: string, code: string) {
  const cart = await getOrCreateCart(retailerId);

  const discountCode = await prisma.discountCode.findUnique({
    where: { code },
  });

  if (!discountCode || !discountCode.isActive) {
    throw new Error("İndirim kodu geçersiz");
  }

  if (discountCode.expiresAt && discountCode.expiresAt < new Date()) {
    throw new Error("İndirim kodu süresi dolmuş");
  }

  if (discountCode.usedCount >= discountCode.maxUses) {
    throw new Error("İndirim kodu kullanım limiti dolmuş");
  }

  // Attach to cart
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: discountCode.id },
  });

  // Increment usage count to mark redemption
  await prisma.discountCode.update({
    where: { id: discountCode.id },
    data: { usedCount: discountCode.usedCount + 1 },
  });

  return getCart(retailerId);
}

export async function removeDiscountCode(retailerId: string) {
  const cart = await getOrCreateCart(retailerId);
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: null },
  });
  return getCart(retailerId);
}