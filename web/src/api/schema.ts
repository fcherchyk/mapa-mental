/**
 * Tipos de los esquemas del OpenAPI de la API, con la forma que genera openapi-typescript.
 * Se regenera con `pnpm gen:api` (exporta api → openapi.json y corre openapi-typescript).
 */

export interface components {
  schemas: {
    UserSettings: {
      /** @default 3 */
      depth?: number;
    };
    SettingsPatch: {
      depth: number;
    };
    MeOut: {
      id: string;
      email: string;
      name: string;
      avatar_url: string | null;
      settings: components['schemas']['UserSettings'];
      root_node_id: string;
    };
    NodeCreate: {
      title: string;
      after_sort_key?: string | null;
      /** @default idea */
      kind?: string;
      props?: { [key: string]: unknown };
    };
    NodePatch: {
      version: number;
      title?: string | null;
      collapsed?: boolean | null;
      sort_key?: string | null;
      kind?: string | null;
      props?: { [key: string]: unknown } | null;
    };
    NodeOut: {
      id: string;
      parent_id: string | null;
      kind: string;
      title: string;
      sort_key: string;
      collapsed: boolean;
      props: { [key: string]: unknown };
      version: number;
      child_count: number;
    };
    WindowNode: components['schemas']['NodeOut'] & {
      /** Distance to the focus: 1 means its direct children. */
      level: number;
    };
    NodeView: {
      focus: components['schemas']['NodeOut'];
      /** From the root to the focus's parent. */
      ancestors: components['schemas']['NodeOut'][];
      /** By level; siblings by sort_key. */
      nodes: components['schemas']['WindowNode'][];
    };
  };
}
