import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import type { Express } from "express";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";

export async function setupGraphQL(app: Express) {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // Enable introspection so frontend tooling and developers can explore the schema
    introspection: true,
    // Format errors with stack traces for easier debugging
    formatError: (formattedError, error) => {
      console.error("[GraphQL error]", error);
      return formattedError;
    },
  });

  await server.start();

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Pass the auth header through; resolvers can use it later if needed
        return { authHeader: req.headers.authorization };
      },
    })
  );
}