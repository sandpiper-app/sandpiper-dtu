/**
 * GraphQL Query Cost Calculator for Shopify twin
 *
 * Implements Shopify's query cost algorithm:
 * - Scalar/Enum fields: 0 points
 * - Object fields: 1 point (multiplied by parent connection size when nested)
 * - Connection fields (types ending in "Connection", or root fields with first/last arg): 2 + (first ?? last ?? 10) points
 * - Mutations: 10 points base cost
 *
 * Nested connections multiply child costs by parent page size.
 */

import {
  visit,
  type DocumentNode,
  type GraphQLSchema,
  type SelectionSetNode,
  type FieldNode,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  isObjectType,
  isScalarType,
  isEnumType,
} from 'graphql';

/**
 * Unwrap NonNull and List wrappers to get the base named type.
 */
function unwrapType(type: any): any {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    return unwrapType(type.ofType);
  }
  return type;
}

/**
 * Determine if a GraphQL type is a Connection type.
 * Connections: type name ends with "Connection".
 */
function isConnectionType(typeName: string): boolean {
  return typeName.endsWith('Connection');
}

/**
 * Resolve an argument value, handling variable references.
 */
function resolveArgValue(
  argValue: any,
  variables: Record<string, unknown> | undefined
): number | undefined {
  if (!argValue) return undefined;

  if (argValue.kind === 'IntValue') {
    return parseInt(argValue.value, 10);
  }

  if (argValue.kind === 'Variable' && variables) {
    const varVal = variables[argValue.name.value];
    if (typeof varVal === 'number') return varVal;
    if (typeof varVal === 'string') {
      const parsed = parseInt(varVal, 10);
      if (!isNaN(parsed)) return parsed;
    }
  }

  return undefined;
}

/**
 * Get the page size (first or last argument) from a field node.
 * Returns undefined if neither is present.
 */
function getPageSize(
  fieldNode: FieldNode,
  variables: Record<string, unknown> | undefined
): number | undefined {
  if (!fieldNode.arguments || fieldNode.arguments.length === 0) return undefined;

  for (const arg of fieldNode.arguments) {
    if (arg.name.value === 'first' || arg.name.value === 'last') {
      const resolved = resolveArgValue(arg.value, variables);
      if (resolved !== undefined) return resolved;
    }
  }

  return undefined;
}

/**
 * Calculate the cost of a selection set within a given parent type.
 * @param selectionSet - The selection set to evaluate
 * @param parentType - The GraphQL type of the object being selected from
 * @param schema - The full schema (for type lookups)
 * @param multiplierStack - Stack of connection page sizes for nested cost multiplication
 * @param variables - Query variables for resolving variable references
 * @returns Total cost of this selection set
 */
function calculateSelectionSetCost(
  selectionSet: SelectionSetNode | undefined,
  parentType: GraphQLObjectType | null,
  schema: GraphQLSchema,
  multiplierStack: number[],
  variables: Record<string, unknown> | undefined
): number {
  if (!selectionSet) return 0;

  let cost = 0;
  const currentMultiplier = multiplierStack.length > 0
    ? multiplierStack[multiplierStack.length - 1]
    : 1;

  for (const selection of selectionSet.selections) {
    if (selection.kind !== 'Field') continue;

    const fieldNode = selection as FieldNode;
    const fieldName = fieldNode.name.value;

    // Skip introspection fields
    if (fieldName.startsWith('__')) continue;

    // Find the field definition in the parent type
    const fieldDef = parentType ? parentType.getFields()[fieldName] : null;
    const fieldType = fieldDef ? unwrapType(fieldDef.type) : null;
    const fieldTypeName = fieldType?.name ?? '';

    if (isConnectionType(fieldTypeName)) {
      // Connection field: cost = 2 + pageSize, multiplied by current multiplier
      const pageSize = getPageSize(fieldNode, variables) ?? 10;
      const connectionCost = 2 + pageSize;
      cost += connectionCost * currentMultiplier;

      // Recurse with new multiplier = pageSize pushed onto stack
      const newStack = [...multiplierStack, pageSize];
      cost += calculateSelectionSetCost(
        fieldNode.selectionSet,
        fieldType as GraphQLObjectType,
        schema,
        newStack,
        variables
      );
    } else if (fieldType && isObjectType(fieldType)) {
      // Object field (non-connection): cost = 1 * currentMultiplier
      cost += 1 * currentMultiplier;

      // Recurse with same multiplier stack
      cost += calculateSelectionSetCost(
        fieldNode.selectionSet,
        fieldType as GraphQLObjectType,
        schema,
        multiplierStack,
        variables
      );
    } else {
      // Scalar or Enum: 0 cost
      // (no recursion needed)
    }
  }

  return cost;
}

/**
 * Calculate the cost of a GraphQL query document according to Shopify's algorithm.
 *
 * @param document - Parsed GraphQL document
 * @param schema - Executable GraphQL schema (used for type information)
 * @param variables - Optional query variables
 * @returns Total query cost in points
 */
export function calculateQueryCost(
  document: DocumentNode,
  schema: GraphQLSchema,
  variables?: Record<string, unknown>
): number {
  let totalCost = 0;

  for (const definition of document.definitions) {
    if (definition.kind === 'OperationDefinition') {
      if (definition.operation === 'mutation') {
        // Mutations have a base cost of 10 plus field costs
        totalCost += 10;
        const mutationType = schema.getMutationType() as GraphQLObjectType | null;
        totalCost += calculateSelectionSetCost(
          definition.selectionSet,
          mutationType,
          schema,
          [],
          variables
        );
      } else {
        // Query or subscription
        const queryType = schema.getQueryType() as GraphQLObjectType | null;
        totalCost += calculateSelectionSetCost(
          definition.selectionSet,
          queryType,
          schema,
          [],
          variables
        );
      }
    }
  }

  return totalCost;
}
