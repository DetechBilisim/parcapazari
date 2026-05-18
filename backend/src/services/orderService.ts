import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/client.js";

async function generateOrderNumber(): Promise<string> {
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS pp_order_seq START WITH 1000 INCREMENT BY 1`
  );
  const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('pp_order_seq') AS nextval`
  );
  const seq = Number(rows[0].nextval).toString().padStart(6, "0");
  const year = new Date().getFullYear();
  return `PP-${year}-${seq}`;
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
    const orderNumber = await generateOrderNumber();

    const order = await prisma.order.create({
      data: {
        orderNumber,
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
  if (status === "CONFIRMED") {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) throw new Error("Sipariş bulunamadı");

      for (const item of order.items) {
        await tx.partListing.update({
          where: { id: item.partListingId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status },
        include: { items: true },
      });
    });
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: { items: true },
  });
}