export const typeDefs = `#graphql
  enum PartCategory {
    BRAKES
    ENGINE
    SUSPENSION
    ELECTRICAL
    TRANSMISSION
    EXHAUST
    COOLING
    FILTERS
    BODY
    INTERIOR
    OTHER
  }

  enum Currency {
    TRY
    EUR
    USD
  }

  enum SortOrder {
    PRICE_ASC
    PRICE_DESC
    NEWEST
    BRAND_ASC
  }

  type Wholesaler {
    id: ID!
    companyName: String!
  }

  type Part {
    id: ID!
    sku: String!
    oemCodes: [String!]!
    brand: String!
    name: String!
    description: String
    category: PartCategory!
    imageUrl: String
    vehicleMakes: [String!]!
    vehicleModels: [String!]!
    listings(inStockOnly: Boolean): [PartListing!]!
    listingCount: Int!
    lowestPrice: String
  }

  type PartListing {
    id: ID!
    price: String!
    currency: Currency!
    stock: Int!
    minOrderQty: Int!
    notes: String
    isActive: Boolean!
    part: Part!
    wholesaler: Wholesaler!
  }

  input PartSearchFilters {
    query: String
    brand: String
    category: PartCategory
    currency: Currency
    inStockOnly: Boolean
    sortBy: SortOrder
  }

  type PartConnection {
    items: [Part!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  type Query {
    parts(filters: PartSearchFilters, limit: Int, offset: Int): PartConnection!
    part(id: ID, sku: String): Part
    partByOemCode(oemCode: String!): [Part!]!
    brands: [String!]!
    listing(id: ID!): PartListing
  }
`;