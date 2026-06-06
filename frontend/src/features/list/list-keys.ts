// TODO: Review this file
export const listKeys = {
  all: () => ["lists"] as const,
  mine: () => [...listKeys.all(), "mine"] as const,
  public: () => [...listKeys.all(), "public"] as const,
  detail: (listId: string) => [...listKeys.all(), "detail", listId] as const,
}
