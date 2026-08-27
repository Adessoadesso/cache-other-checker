export interface NavNode {
  title: string;
  /** Present only when this menu item resolves to a published page on live site. */
  path?: string;
  children?: NavNode[];
}
