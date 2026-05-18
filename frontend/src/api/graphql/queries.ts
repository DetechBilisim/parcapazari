import { gql } from "@apollo/client";

export const SEARCH_PARTS = gql`
  query SearchParts($filters: PartSearchFilters, $limit: Int, $offset: Int, $inStockOnly: Boolean) {
    parts(filters: $filters, limit: $limit, offset: $offset) {
      totalCount
      hasMore
      items {
        id
        sku
        oemCodes
        brand
        name
        description
        category
        imageUrl
        vehicleMakes
        vehicleModels
        listings(inStockOnly: $inStockOnly) {
          id
          price
          currency
          stock
          minOrderQty
          notes
          wholesaler {
            id
            companyName
          }
        }
      }
    }
  }
`;

export const GET_BRANDS = gql`
  query GetBrands {
    brands
  }
`;

export const SEARCH_BY_OEM = gql`
  query SearchByOem($oemCode: String!) {
    partByOemCode(oemCode: $oemCode) {
      id
      sku
      brand
      name
      category
    }
  }
`;