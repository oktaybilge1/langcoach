# Export your cards to Anki, Quizlet or CSV

LangCoach can export your review cards as plain text files that Anki, Quizlet and spreadsheets understand. No add-on, no account, no network: the file is created on your computer.

- **Browser extension:** open the side panel, go to **Settings > Export cards** and press **Anki**, **Quizlet** or **CSV**.
- **Claude Code:** ask Claude to run the `export_cards` tool (format `anki`, `quizlet` or `csv`) and save the result to a file for you.

Files are named `langcoach-anki-YYYY-MM-DD.txt`, `langcoach-quizlet-YYYY-MM-DD.txt` and `langcoach-cards-YYYY-MM-DD.csv`.

## Anki Desktop (2.1.54 or newer)

1. Open Anki and choose **File > Import**.
2. Select the `langcoach-anki-….txt` file.
3. The import window reads the header of the file, so the field separator (tab), HTML, deck (`LangCoach`) and tags are already set. Check that the **Note type** is **Basic** and the deck is the one you want.
4. Make sure the mapping is: column 1 = GUID, column 2 = Front, column 3 = Back, column 4 = Tags.
5. Under **Existing notes**, choose **Update** so that exporting again later updates the notes you already have instead of creating duplicates. Each card carries a stable GUID (the LangCoach card id) for this.
6. Press **Import**.

Each note has the word (with pronunciation, if any) on the front. The back shows your native-language meaning first when it exists, then the original translation, the example sentence in italics and the note. Tags are `langcoach`, the target language and the lesson situation.

## AnkiMobile (iPhone/iPad) and AnkiDroid

Import on the desktop and sync with AnkiWeb, which is the most reliable way. AnkiDroid and AnkiMobile can also open the `.txt` file directly (share it to the app); the options they show differ by version, and older versions may not understand the header lines. If the columns look wrong, import on the desktop instead.

## Quizlet

Open a new study set, choose **Import**, and paste the contents of the `langcoach-quizlet-….txt` file. Keep **Tab** as the separator between term and definition and **New line** between cards. The definition is the translation, followed by your native translation after " / " when there is one.

## CSV

The `.csv` file has the columns `term, translation, native_translation, example, pronunciation, note, lesson, language, favorite, mastered, due`. It is UTF-8 without a byte-order mark. In Excel use **Data > From Text/CSV** and pick UTF-8 so that Arabic, Chinese and accented text show correctly; Google Sheets and LibreOffice open it directly.

To stop spreadsheets from running text as formulas, every CSV cell whose first significant character (after any leading whitespace, control or zero-width characters) is `=`, `+`, `-` or `@` gets a leading apostrophe. This also affects harmless entries such as `-ing suffix`. Anki and Quizlet files are not changed this way.

## What is and is not carried over

- Carried over: term, pronunciation, translation, native translation, example, note, language, lesson situation, and (CSV only) favorite and mastered flags.
- **Not exported: scheduling data.** Cards start fresh in Anki, with no review history, due dates or ease. LangCoach keeps its own schedule.
- Cards without a term are skipped. In Claude Code you can leave out mastered cards (`includeMastered: false`). Exports over 2 MB through Claude Code are refused; use the extension button or leave out mastered cards.
