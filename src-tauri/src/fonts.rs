use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct FontFamily {
  pub name: String,
  pub styles: Vec<String>,
}

#[tauri::command]
pub fn list_fonts() -> Vec<FontFamily> {
  let mut db = fontdb::Database::new();
  db.load_system_fonts();

  use std::collections::{BTreeMap, BTreeSet};
  let mut map: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

  for face in db.faces() {
    let fam = face.families
      .get(0)
      .map(|(n, _)| n.to_string())
      .unwrap_or_else(|| "Unknown".into());

    let style = match face.style {
      fontdb::Style::Normal => "Regular",
      fontdb::Style::Italic => "Italic",
      fontdb::Style::Oblique => "Oblique",
    };

    let w = face.weight.0; // 100~900
    let weight = match w {
      100..=150 => "Thin",
      151..=250 => "ExtraLight",
      251..=350 => "Light",
      351..=450 => if style=="Regular" { "Regular" } else { style },
      451..=550 => "Medium",
      551..=650 => "SemiBold",
      651..=750 => "Bold",
      751..=850 => "ExtraBold",
      _ => "Black",
    };

    let label = if style=="Regular" { weight.to_string() } else { format!("{weight} {style}") };
    map.entry(fam).or_default().insert(label);
  }

  map.into_iter()
    .map(|(name, set)| FontFamily { name, styles: set.into_iter().collect() })
    .collect()
}
