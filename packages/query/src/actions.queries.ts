/** Types generated for queries found in "./src/actions.sql" */
import { PreparedQuery } from '@pgtyped/query';

/** 'GetCatalogTypes' parameters type */
export interface IGetCatalogTypesParams {
  oids: Array<number | null | void>;
}

/** 'GetCatalogTypes' return type */
export interface IGetCatalogTypesResult {
  oid: number;
  typname: string;
  typtype: string;
  enumlabel: string;
}

/** 'GetCatalogTypes' query type */
export interface IGetCatalogTypesQuery {
  params: IGetCatalogTypesParams;
  result: IGetCatalogTypesResult;
}

const getCatalogTypesIR: any = {"name":"GetCatalogTypes","params":[{"name":"oids","codeRefs":{"defined":{"a":36,"b":39,"line":3,"col":9},"used":{"a":184,"b":187,"line":8,"col":17}},"transform":{"type":"array_spread"}}],"usedParamSet":{"oids":true},"statement":{"body":"SELECT pt.oid, pt.typname, pt.typtype, pe.enumlabel\nFROM pg_type pt\nLEFT JOIN pg_enum pe ON pt.oid = pe.enumtypid\nWHERE pt.oid IN :oids","loc":{"a":53,"b":187,"line":5,"col":0}}};

/**
 * Query generated from SQL:
 * ```
 * SELECT pt.oid, pt.typname, pt.typtype, pe.enumlabel
 * FROM pg_type pt
 * LEFT JOIN pg_enum pe ON pt.oid = pe.enumtypid
 * WHERE pt.oid IN :oids
 * ```
 */
export const getCatalogTypes = new PreparedQuery<IGetCatalogTypesParams,IGetCatalogTypesResult>(getCatalogTypesIR);


