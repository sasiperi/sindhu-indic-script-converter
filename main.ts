import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, MarkdownView, Modal } from "obsidian";
import Sanscript from "@indic-transliteration/sanscript";

interface TransliterationSettings {
  inputScript: string;
  outputScript: string;
  appendMode: boolean;
  previewBeforeApply: boolean;
}

const DEFAULT_SETTINGS: TransliterationSettings = {
  inputScript: "itrans",
  outputScript: "devanagari",
  appendMode: true,
  previewBeforeApply: false,
};

export default class TransliterationPlugin extends Plugin {
  settings: TransliterationSettings;
  statusBarEl: HTMLElement;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TransliterationSettingTab(this.app, this));

    this.statusBarEl = this.addStatusBarItem();
    this.updateStatusBar();

    // Normal direction command
    this.addCommand({
      id: "convert-selection-or-note",
      name: "Convert Selection or Entire Note",
      callback: () => this.convertCurrentNoteOrSelection(),
    });

    // Reverse direction command
    this.addCommand({
      id: "convert-selection-reversed",
      name: "Convert Selection using Reversed Direction",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const editor = view.editor;
        const selectedText = editor.getSelection();
        if (!selectedText) {
          new Notice("No text selected.");
          return;
        }

        const reversed = Sanscript.t(selectedText, this.settings.outputScript, this.settings.inputScript);

        if (this.settings.previewBeforeApply) {
          new PreviewModal(this.app, `${selectedText} → ${reversed}`, () => {
            editor.replaceSelection(this.settings.appendMode
              ? `${selectedText} (${reversed})`
              : reversed);
          }).open();
        } else {
          editor.replaceSelection(this.settings.appendMode
            ? `${selectedText} (${reversed})`
            : reversed);
        }
      },
    });

    // Context menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) => {
          item.setTitle("🔁 Convert using Transliterator").onClick(() => {
            this.convertSelection(editor);
          });
        });
      })
    );

    // Status bar toggle
    this.statusBarEl.onclick = () => {
      const oldInput = this.settings.inputScript;
      this.settings.inputScript = this.settings.outputScript;
      this.settings.outputScript = oldInput;
      this.saveSettings();
      this.updateStatusBar();
    };
  }

  updateStatusBar() {
    this.statusBarEl.setText(`${this.settings.inputScript} 🔁 ${this.settings.outputScript}`);
  }

  convertText(text: string): string {
    return Sanscript.t(text, this.settings.inputScript, this.settings.outputScript);
  }

  convertSelection(editor: any) {
    const selectedText = editor.getSelection();
    if (!selectedText) return;

    const converted = this.convertText(selectedText);

    if (this.settings.previewBeforeApply) {
      new PreviewModal(this.app, `${selectedText} → ${converted}`, () => {
        editor.replaceSelection(this.settings.appendMode
          ? `${selectedText} (${converted})`
          : converted);
      }).open();
    } else {
      editor.replaceSelection(this.settings.appendMode
        ? `${selectedText} (${converted})`
        : converted);
    }
  }

  convertCurrentNoteOrSelection() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const editor = view.editor;
    const selectedText = editor.getSelection();

    if (selectedText) {
      this.convertSelection(editor);
    } else {
      const fullText = editor.getValue();
      const converted = this.convertText(fullText);
      editor.setValue(this.settings.appendMode
        ? `${fullText}\n\n---\n\n${converted}`
        : converted);
    }
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class PreviewModal extends Modal {
  constructor(app: App, private previewText: string, private onConfirm: () => void) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("div", { text: this.previewText, cls: "preview-text" });
    const btn = contentEl.createEl("button", { text: "✅ Convert" });
    btn.onclick = () => {
      this.onConfirm();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TransliterationSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TransliterationPlugin) {
    super(app, plugin);
  }

  getSchemeOptions(): Record<string, string> {
    return {
      devanagari: "Devanagari (अ)",
      bengali: "Bengali (অ)",
      gurmukhi: "Gurmukhi (ਅ)",
      gujarati: "Gujarati (અ)",
      oriya: "Oriya (ଅ)",
      tamil: "Tamil (அ)",
      telugu: "Telugu (అ)",
      kannada: "Kannada (ಅ)",
      malayalam: "Malayalam (അ)",
      itrans: "ITRANS",
      iast: "IAST",
      kolkata: "Kolkata",
      hk: "Harvard-Kyoto",
      slp1: "SLP1",
      wx: "WX",
    };
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Input Script")
      .addDropdown((dropdown) => {
        const options = this.getSchemeOptions();
        for (const key in options) {
          dropdown.addOption(key, options[key]);
        }
        dropdown.setValue(this.plugin.settings.inputScript);
        dropdown.onChange(async (value) => {
          this.plugin.settings.inputScript = value;
          await this.plugin.saveSettings();
          this.plugin.updateStatusBar();
        });
      });

    new Setting(containerEl)
      .setName("Output Script")
      .addDropdown((dropdown) => {
        const options = this.getSchemeOptions();
        for (const key in options) {
          dropdown.addOption(key, options[key]);
        }
        dropdown.setValue(this.plugin.settings.outputScript);
        dropdown.onChange(async (value) => {
          this.plugin.settings.outputScript = value;
          await this.plugin.saveSettings();
          this.plugin.updateStatusBar();
        });
      });

    new Setting(containerEl)
      .setName("Append instead of Replace")
      .setDesc("If ON, keeps original and adds converted text in parentheses.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.appendMode).onChange(async (value) => {
          this.plugin.settings.appendMode = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Always show preview before applying")
      .setDesc("Enable preview popup before applying conversion.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.previewBeforeApply).onChange(async (value) => {
          this.plugin.settings.previewBeforeApply = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("hr");
    containerEl.createEl("div", { text: "☕ Like this plugin? Support my work!" });

    const coffeeLink = containerEl.createEl("a", {
      text: "Buy Me a ☕ Coffee",
      href: "https://github.com/sponsors/sasiperi?frequency=one-time",
    });
    coffeeLink.setAttribute("target", "_blank");
    coffeeLink.setAttribute("style", "color: var(--text-accent); font-weight: bold;");

    containerEl.createEl("hr");
    containerEl.createEl("div", { text: "" });
    const companyLink = containerEl.createEl("a", {
      text: "Visit my Website",
      href: "https://fourthquest.com/",
    });
    companyLink.setAttribute("target", "_blank");
    companyLink.setAttribute("style", "color: var(--text-accent); font-weight: bold;");
  }
}
