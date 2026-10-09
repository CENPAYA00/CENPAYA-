import type { SupabaseClient } from "@supabase/supabase-js";

export async function searchMarketplaceListings(
  supabase: SupabaseClient,
  searchText: string,
  page = 0
) {
  const term = searchText.trim();
  if (!term) return [];

  const pageSize = 20;
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, seller_id, title, price, images, created_at, listing_type, category_id"
    )
    .eq("moderation_status", "approved")
    .textSearch("search_vector", term, {
      type: "websearch",
      config: "simple",
    })
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (error) throw error;
  return data ?? [];
}