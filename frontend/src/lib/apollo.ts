import { ApolloClient, InMemoryCache, HttpLink, ApolloLink } from "@apollo/client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const httpLink = new HttpLink({
  uri: `${API_URL}/graphql`,
});

const authLink = new ApolloLink((operation, forward) => {
  const token = localStorage.getItem("parcapazar_token");
  if (token) {
    operation.setContext(({ headers = {} }: { headers: Record<string, string> }) => ({
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
    }));
  }
  return forward(operation);
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
