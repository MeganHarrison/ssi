# PDF fallback fonts

These static subset fonts are used only when the OWLS II template PDF is unavailable. They prevent user-provided names and notes from failing PDF generation when they contain Latin, Arabic, or common CJK characters.

- `NotoSans-Latin.ttf`: Noto Sans variable font instantiated at regular weight and subset for Latin, Greek, Cyrillic, punctuation, and symbols.
- `NotoSansArabic.ttf`: Noto Sans Arabic variable font instantiated at regular width and weight and subset for Latin and Arabic code points.
- `NotoSansSC.ttf`: Noto Sans SC variable font instantiated at regular weight and subset for Latin, CJK punctuation, common CJK ideographs, fullwidth characters, and symbols.

The fonts are from the Google Fonts `notosans`, `notosansarabic`, and `notosanssc` families. Each family is licensed under the SIL Open Font License; the corresponding license texts are included beside the font files. The application embeds only the glyphs used in each generated PDF.
