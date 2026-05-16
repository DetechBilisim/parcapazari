import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/client.js";

// Generate a human-readable order number
function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `PP-${timestamp}-${random}`;
}

interface CheckoutInput {
  retailerId: string;
  shippingAddress?: string;
  notes?: string;
}

export async function checkout(input: CheckoutInput) {
  const cart = await prisma.cart.findUnique({
    where: { retailerId: input.retailerId },
    include: {
      items: { include: { partListing: true } },
      discountCode: true,
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new Error("Sepet boş");
  }

  // Group cart items by wholesaler — each becomes a separate order
  const itemsByWholesaler = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    const wid = item.partListing.wholesalerId;
    if (!itemsByWholesaler.has(wid)) {
      itemsByWholesaler.set(wid, []);
    }
    itemsByWholesaler.get(wid)!.push(item);
  }

  const discountPercent = cart.discountCode?.discountPercent || 0;
  const createdOrders = [];

  for (const [wholesalerId, items] of itemsByWholesaler.entries()) {
    const subtotal = items.reduce(
      (sum, i) => sum.plus(i.unitPrice.times(i.quantity)),
      new Decimal(0)
    );

    const discountAmount = subtotal.times(discountPercent).dividedBy(100);
    const total = subtotal.minus(discountAmount);

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        retailerId: input.retailerId,
        wholesalerId,
        status: "PAID", // mock payment auto-succeeds
        subtotal,
        discountAmount,
        total,
        currency: items[0].currency,
        discountCode: cart.discountCode?.code,
        shippingAddress: input.shippingAddress,
        notes: input.notes,
        items: {
          create: await Promise.all(
            items.map(async (i) => {
              const listing = await prisma.partListing.findUnique({
                where: { id: i.partListingId },
                include: { part: true },
              });
              return {
                partListingId: i.partListingId,
                partSku: listing!.part.sku,
                partName: listing!.part.name,
                partBrand: listing!.part.brand,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                lineTotal: i.unitPrice.times(i.quantity),
              };
            })
          ),
        },
      },
      include: { items: true },
    });

    createdOrders.push(order);
  }

  // Clear the cart after successful checkout
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: null },
  });

  return createdOrders;
}

export async function getRetailerOrders(retailerId: string) {
  return prisma.order.findMany({
    where: { retailerId },
    include: {
      items: true,
      wholesaler: { select: { id: true, companyName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWholesalerOrders(wholesalerId: string) {
  return prisma.order.findMany({
    where: { wholesalerId },
    include: {
      items: true,
      retailer: { select: { id: true, companyName: true, contactPhone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderById(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      retailer: { select: { id: true, companyName: true, contactPhone: true, address: true } },
      wholesaler: { select: { id: true, companyName: true } },
    },
  });
}

export async function updateOrderStatus(orderId: string, status: any) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: { items: true },
  });
}