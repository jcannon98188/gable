import type { CatalogSource } from "@gable/core";

/**
 * The message catalogs of the i18n demo, keyed by the explicit ids (`@@id`) used in `i18n-demo.ts`.
 * Each value is an ICU message: translators write the plural, select, number and date forms, and may reorder the
 * placeholders. The English catalog is there because the source text of a template message is plain text (`{0} unread
 * messages`), so English plurals need a catalog entry of their own, exactly like any other language.
 */
export const catalogs = {
  en: {
    title: "Your inbox",
    unread: "{0, plural, =0 {No unread messages} one {# unread message} other {# unread messages}}",
    reply: "{0, select, female {She} male {He} other {They}} replied to your thread",
    stats: "{0, number} downloads since {1, date, long}",
    balance: "Balance: {0, number, currency:USD}",
    saved: "Settings saved",
  },
  fr: {
    title: "Votre boîte de réception",
    unread: "{0, plural, =0 {Aucun message non lu} one {# message non lu} other {# messages non lus}}",
    reply: "{0, select, female {Elle a} male {Il a} other {Iel a}} répondu à votre fil",
    stats: "{0, number} téléchargements depuis le {1, date, long}",
    balance: "Solde : {0, number, currency:EUR}",
    saved: "Paramètres enregistrés",
  },
  ar: {
    title: "صندوق الوارد",
    unread:
      "{0, plural, zero {لا رسائل غير مقروءة} one {رسالة واحدة غير مقروءة} two {رسالتان غير مقروءتين} few {# رسائل غير مقروءة} many {# رسالة غير مقروءة} other {# رسالة غير مقروءة}}",
    reply: "{0, select, female {ردّت} male {ردّ} other {تم الرد}} على موضوعك",
    stats: "{0, number} تنزيل منذ {1, date, long}",
    balance: "الرصيد: {0, number, currency:SAR}",
    saved: "تم حفظ الإعدادات",
  },
  // Deliberately incomplete: the messages it does not have fall back to the source text and are reported as missing.
  de: {
    title: "Ihr Posteingang",
    unread: "{0, plural, one {# ungelesene Nachricht} other {# ungelesene Nachrichten}}",
    stats: "{0, number} Downloads seit {1, date, long}",
  },
} satisfies Record<string, CatalogSource>;

export type DemoLocale = keyof typeof catalogs;

export const locales: readonly { code: DemoLocale; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "de", label: "Deutsch (partial)", dir: "ltr" },
];
