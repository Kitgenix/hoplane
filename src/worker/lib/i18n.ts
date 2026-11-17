/**
 * Translations for the pages visitors see: link errors, the password form and
 * the "you are leaving" warning. The dashboard is not translated here.
 *
 * Adding a language: copy the `en` block, translate every string, add the
 * locale to LOCALES, and run the tests (they check every key is present).
 * Keep `{host}` in warning.heading. Brand names and the attribution footer
 * are never translated.
 */

export const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt-BR', 'ja', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

interface Notice {
  title: string;
  message: string;
}

export interface Messages {
  goHome: string;
  notFound: Notice;
  pageNotFound: Notice;
  error: Notice;
  disabled: Notice;
  scheduled: Notice;
  expired: Notice;
  invalidDestination: Notice;
  linkChanged: Notice;
  password: { title: string; heading: string; message: string; label: string; submit: string; wrong: string; tooMany: string };
  warning: { title: string; eyebrow: string; heading: string; notice: string; continue: string; cancel: string };
  openLink: string;
}

const en: Messages = {
  goHome: 'Go to homepage',
  notFound: { title: 'Link not found', message: 'This short link does not exist. Check the address and try again.' },
  pageNotFound: { title: 'Page not found', message: 'We could not find that page.' },
  error: { title: 'Something went wrong', message: 'Please try again in a moment.' },
  disabled: { title: 'Link unavailable', message: 'This link has been turned off by its owner.' },
  scheduled: { title: 'Not live yet', message: 'This link is scheduled and is not active yet. Please check back later.' },
  expired: { title: 'Link expired', message: 'This short link is no longer active.' },
  invalidDestination: { title: 'Invalid destination', message: 'This link points to an address that cannot be opened.' },
  linkChanged: { title: 'Link changed', message: 'This short link was updated. Please try again.' },
  password: {
    title: 'Protected link',
    heading: 'This link needs a password',
    message: 'Enter the password you were given to continue.',
    label: 'Password',
    submit: 'Continue',
    wrong: 'That password is not correct.',
    tooMany: 'Too many attempts. Please wait a few minutes and try again.',
  },
  warning: {
    title: 'You are leaving',
    eyebrow: 'Check before you continue',
    heading: 'You are about to visit {host}',
    notice: 'This link goes to an external website. Only continue if you trust where it is going.',
    continue: 'Continue to site',
    cancel: 'Cancel',
  },
  openLink: 'Open link',
};

const de: Messages = {
  goHome: 'Zur Startseite',
  notFound: { title: 'Link nicht gefunden', message: 'Diesen Kurzlink gibt es nicht. Prüfen Sie die Adresse und versuchen Sie es erneut.' },
  pageNotFound: { title: 'Seite nicht gefunden', message: 'Diese Seite konnten wir nicht finden.' },
  error: { title: 'Etwas ist schiefgelaufen', message: 'Bitte versuchen Sie es gleich noch einmal.' },
  disabled: { title: 'Link nicht verfügbar', message: 'Dieser Link wurde von seinem Inhaber deaktiviert.' },
  scheduled: { title: 'Noch nicht aktiv', message: 'Dieser Link ist geplant und noch nicht aktiv. Bitte schauen Sie später noch einmal vorbei.' },
  expired: { title: 'Link abgelaufen', message: 'Dieser Kurzlink ist nicht mehr aktiv.' },
  invalidDestination: { title: 'Ungültiges Ziel', message: 'Dieser Link führt zu einer Adresse, die nicht geöffnet werden kann.' },
  linkChanged: { title: 'Link geändert', message: 'Dieser Kurzlink wurde gerade aktualisiert. Bitte versuchen Sie es erneut.' },
  password: {
    title: 'Geschützter Link',
    heading: 'Für diesen Link ist ein Passwort erforderlich',
    message: 'Geben Sie das Passwort ein, das Sie erhalten haben, um fortzufahren.',
    label: 'Passwort',
    submit: 'Weiter',
    wrong: 'Das Passwort ist nicht korrekt.',
    tooMany: 'Zu viele Versuche. Bitte warten Sie einige Minuten und versuchen Sie es erneut.',
  },
  warning: {
    title: 'Sie verlassen diese Seite',
    eyebrow: 'Erst prüfen, dann weiter',
    heading: 'Sie sind dabei, {host} aufzurufen',
    notice: 'Dieser Link führt zu einer externen Website. Fahren Sie nur fort, wenn Sie dem Ziel vertrauen.',
    continue: 'Weiter zur Website',
    cancel: 'Abbrechen',
  },
  openLink: 'Link öffnen',
};

const es: Messages = {
  goHome: 'Ir a la página de inicio',
  notFound: { title: 'Enlace no encontrado', message: 'Este enlace corto no existe. Comprueba la dirección e inténtalo de nuevo.' },
  pageNotFound: { title: 'Página no encontrada', message: 'No hemos encontrado esa página.' },
  error: { title: 'Algo ha salido mal', message: 'Vuelve a intentarlo en un momento.' },
  disabled: { title: 'Enlace no disponible', message: 'Su propietario ha desactivado este enlace.' },
  scheduled: { title: 'Aún no está activo', message: 'Este enlace está programado y todavía no está activo. Vuelve a consultarlo más tarde.' },
  expired: { title: 'Enlace caducado', message: 'Este enlace corto ya no está activo.' },
  invalidDestination: { title: 'Destino no válido', message: 'Este enlace apunta a una dirección que no se puede abrir.' },
  linkChanged: { title: 'Enlace modificado', message: 'Este enlace corto se acaba de actualizar. Inténtalo de nuevo.' },
  password: {
    title: 'Enlace protegido',
    heading: 'Este enlace requiere una contraseña',
    message: 'Introduce la contraseña que te han dado para continuar.',
    label: 'Contraseña',
    submit: 'Continuar',
    wrong: 'La contraseña no es correcta.',
    tooMany: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  },
  warning: {
    title: 'Vas a salir de este sitio',
    eyebrow: 'Comprueba antes de continuar',
    heading: 'Estás a punto de visitar {host}',
    notice: 'Este enlace lleva a un sitio web externo. Continúa solo si confías en su destino.',
    continue: 'Continuar al sitio',
    cancel: 'Cancelar',
  },
  openLink: 'Abrir enlace',
};

const fr: Messages = {
  goHome: "Aller à l'accueil",
  notFound: { title: 'Lien introuvable', message: "Ce lien court n'existe pas. Vérifiez l'adresse et réessayez." },
  pageNotFound: { title: 'Page introuvable', message: "Nous n'avons pas trouvé cette page." },
  error: { title: "Une erreur s'est produite", message: 'Veuillez réessayer dans un instant.' },
  disabled: { title: 'Lien indisponible', message: 'Ce lien a été désactivé par son propriétaire.' },
  scheduled: { title: 'Pas encore actif', message: "Ce lien est programmé et n'est pas encore actif. Revenez plus tard." },
  expired: { title: 'Lien expiré', message: "Ce lien court n'est plus actif." },
  invalidDestination: { title: 'Destination non valide', message: 'Ce lien pointe vers une adresse qui ne peut pas être ouverte.' },
  linkChanged: { title: 'Lien modifié', message: "Ce lien court vient d'être mis à jour. Veuillez réessayer." },
  password: {
    title: 'Lien protégé',
    heading: 'Ce lien nécessite un mot de passe',
    message: 'Saisissez le mot de passe qui vous a été communiqué pour continuer.',
    label: 'Mot de passe',
    submit: 'Continuer',
    wrong: "Ce mot de passe n'est pas correct.",
    tooMany: 'Trop de tentatives. Patientez quelques minutes, puis réessayez.',
  },
  warning: {
    title: 'Vous quittez ce site',
    eyebrow: 'Vérifiez avant de continuer',
    heading: 'Vous êtes sur le point de visiter {host}',
    notice: 'Ce lien mène à un site externe. Ne continuez que si vous faites confiance à sa destination.',
    continue: 'Continuer vers le site',
    cancel: 'Annuler',
  },
  openLink: 'Ouvrir le lien',
};

const it: Messages = {
  goHome: 'Vai alla home page',
  notFound: { title: 'Link non trovato', message: "Questo link breve non esiste. Controlla l'indirizzo e riprova." },
  pageNotFound: { title: 'Pagina non trovata', message: 'Non siamo riusciti a trovare questa pagina.' },
  error: { title: 'Qualcosa è andato storto', message: 'Riprova tra qualche istante.' },
  disabled: { title: 'Link non disponibile', message: 'Questo link è stato disattivato dal proprietario.' },
  scheduled: { title: 'Non ancora attivo', message: 'Questo link è programmato e non è ancora attivo. Riprova più tardi.' },
  expired: { title: 'Link scaduto', message: 'Questo link breve non è più attivo.' },
  invalidDestination: { title: 'Destinazione non valida', message: 'Questo link punta a un indirizzo che non può essere aperto.' },
  linkChanged: { title: 'Link modificato', message: 'Questo link breve è stato appena aggiornato. Riprova.' },
  password: {
    title: 'Link protetto',
    heading: 'Questo link richiede una password',
    message: 'Inserisci la password che hai ricevuto per continuare.',
    label: 'Password',
    submit: 'Continua',
    wrong: 'La password non è corretta.',
    tooMany: 'Troppi tentativi. Attendi qualche minuto e riprova.',
  },
  warning: {
    title: 'Stai uscendo dal sito',
    eyebrow: 'Controlla prima di continuare',
    heading: 'Stai per visitare {host}',
    notice: 'Questo link porta a un sito esterno. Continua solo se ti fidi della destinazione.',
    continue: 'Continua al sito',
    cancel: 'Annulla',
  },
  openLink: 'Apri link',
};

const nl: Messages = {
  goHome: 'Naar de startpagina',
  notFound: { title: 'Link niet gevonden', message: 'Deze korte link bestaat niet. Controleer het adres en probeer het opnieuw.' },
  pageNotFound: { title: 'Pagina niet gevonden', message: 'We konden deze pagina niet vinden.' },
  error: { title: 'Er ging iets mis', message: 'Probeer het zo meteen opnieuw.' },
  disabled: { title: 'Link niet beschikbaar', message: 'Deze link is uitgeschakeld door de eigenaar.' },
  scheduled: { title: 'Nog niet actief', message: 'Deze link is ingepland en nog niet actief. Kom later terug.' },
  expired: { title: 'Link verlopen', message: 'Deze korte link is niet meer actief.' },
  invalidDestination: { title: 'Ongeldige bestemming', message: 'Deze link verwijst naar een adres dat niet kan worden geopend.' },
  linkChanged: { title: 'Link gewijzigd', message: 'Deze korte link is net bijgewerkt. Probeer het opnieuw.' },
  password: {
    title: 'Beveiligde link',
    heading: 'Voor deze link is een wachtwoord nodig',
    message: 'Voer het wachtwoord in dat je hebt gekregen om verder te gaan.',
    label: 'Wachtwoord',
    submit: 'Doorgaan',
    wrong: 'Dat wachtwoord is niet juist.',
    tooMany: 'Te veel pogingen. Wacht een paar minuten en probeer het opnieuw.',
  },
  warning: {
    title: 'Je verlaat deze site',
    eyebrow: 'Controleer voordat je verdergaat',
    heading: 'Je staat op het punt {host} te bezoeken',
    notice: 'Deze link gaat naar een externe website. Ga alleen verder als je de bestemming vertrouwt.',
    continue: 'Doorgaan naar de site',
    cancel: 'Annuleren',
  },
  openLink: 'Link openen',
};

const pl: Messages = {
  goHome: 'Przejdź do strony głównej',
  notFound: { title: 'Nie znaleziono linku', message: 'Ten krótki link nie istnieje. Sprawdź adres i spróbuj ponownie.' },
  pageNotFound: { title: 'Nie znaleziono strony', message: 'Nie udało się znaleźć tej strony.' },
  error: { title: 'Coś poszło nie tak', message: 'Spróbuj ponownie za chwilę.' },
  disabled: { title: 'Link niedostępny', message: 'Ten link został wyłączony przez właściciela.' },
  scheduled: { title: 'Jeszcze nieaktywny', message: 'Ten link jest zaplanowany i jeszcze nie działa. Wróć później.' },
  expired: { title: 'Link wygasł', message: 'Ten krótki link nie jest już aktywny.' },
  invalidDestination: { title: 'Nieprawidłowy adres docelowy', message: 'Ten link prowadzi do adresu, którego nie można otworzyć.' },
  linkChanged: { title: 'Link został zmieniony', message: 'Ten krótki link został właśnie zaktualizowany. Spróbuj ponownie.' },
  password: {
    title: 'Link chroniony',
    heading: 'Ten link wymaga hasła',
    message: 'Wpisz otrzymane hasło, aby kontynuować.',
    label: 'Hasło',
    submit: 'Dalej',
    wrong: 'Nieprawidłowe hasło.',
    tooMany: 'Zbyt wiele prób. Odczekaj kilka minut i spróbuj ponownie.',
  },
  warning: {
    title: 'Opuszczasz tę stronę',
    eyebrow: 'Sprawdź, zanim przejdziesz dalej',
    heading: 'Za chwilę przejdziesz do {host}',
    notice: 'Ten link prowadzi do zewnętrznej witryny. Kontynuuj tylko wtedy, gdy ufasz temu adresowi.',
    continue: 'Przejdź do witryny',
    cancel: 'Anuluj',
  },
  openLink: 'Otwórz link',
};

const ptBR: Messages = {
  goHome: 'Ir para a página inicial',
  notFound: { title: 'Link não encontrado', message: 'Este link curto não existe. Verifique o endereço e tente novamente.' },
  pageNotFound: { title: 'Página não encontrada', message: 'Não encontramos essa página.' },
  error: { title: 'Algo deu errado', message: 'Tente novamente em instantes.' },
  disabled: { title: 'Link indisponível', message: 'Este link foi desativado pelo proprietário.' },
  scheduled: { title: 'Ainda não está ativo', message: 'Este link está agendado e ainda não está ativo. Volte mais tarde.' },
  expired: { title: 'Link expirado', message: 'Este link curto não está mais ativo.' },
  invalidDestination: { title: 'Destino inválido', message: 'Este link aponta para um endereço que não pode ser aberto.' },
  linkChanged: { title: 'Link alterado', message: 'Este link curto acabou de ser atualizado. Tente novamente.' },
  password: {
    title: 'Link protegido',
    heading: 'Este link precisa de uma senha',
    message: 'Digite a senha que você recebeu para continuar.',
    label: 'Senha',
    submit: 'Continuar',
    wrong: 'A senha não está correta.',
    tooMany: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  },
  warning: {
    title: 'Você está saindo',
    eyebrow: 'Confira antes de continuar',
    heading: 'Você está prestes a visitar {host}',
    notice: 'Este link leva a um site externo. Só continue se você confiar no destino.',
    continue: 'Continuar para o site',
    cancel: 'Cancelar',
  },
  openLink: 'Abrir link',
};

const ja: Messages = {
  goHome: 'ホームページへ',
  notFound: { title: 'リンクが見つかりません', message: 'この短縮リンクは存在しません。アドレスを確認して、もう一度お試しください。' },
  pageNotFound: { title: 'ページが見つかりません', message: 'お探しのページは見つかりませんでした。' },
  error: { title: '問題が発生しました', message: 'しばらくしてからもう一度お試しください。' },
  disabled: { title: 'このリンクは利用できません', message: 'このリンクは所有者によって無効にされています。' },
  scheduled: { title: 'まだ公開されていません', message: 'このリンクは公開予定で、まだ有効になっていません。後でもう一度アクセスしてください。' },
  expired: { title: 'リンクの有効期限切れ', message: 'この短縮リンクは有効期限が切れています。' },
  invalidDestination: { title: '無効な転送先', message: 'このリンクの転送先は開くことができません。' },
  linkChanged: { title: 'リンクが変更されました', message: 'この短縮リンクは更新されました。もう一度お試しください。' },
  password: {
    title: '保護されたリンク',
    heading: 'このリンクにはパスワードが必要です',
    message: '続行するには、受け取ったパスワードを入力してください。',
    label: 'パスワード',
    submit: '続行',
    wrong: 'パスワードが正しくありません。',
    tooMany: '試行回数が多すぎます。数分待ってから、もう一度お試しください。',
  },
  warning: {
    title: '外部サイトへ移動します',
    eyebrow: '移動する前にご確認ください',
    heading: '{host} に移動しようとしています',
    notice: 'このリンクは外部のウェブサイトに移動します。移動先を信頼できる場合のみ続行してください。',
    continue: 'サイトへ移動',
    cancel: 'キャンセル',
  },
  openLink: 'リンクを開く',
};

const zhCN: Messages = {
  goHome: '返回首页',
  notFound: { title: '找不到链接', message: '此短链接不存在。请检查地址后重试。' },
  pageNotFound: { title: '找不到页面', message: '我们找不到该页面。' },
  error: { title: '出了点问题', message: '请稍后重试。' },
  disabled: { title: '链接不可用', message: '此链接已被所有者停用。' },
  scheduled: { title: '尚未生效', message: '此链接已排期，目前尚未生效。请稍后再来。' },
  expired: { title: '链接已过期', message: '此短链接已失效。' },
  invalidDestination: { title: '目标地址无效', message: '此链接指向的地址无法打开。' },
  linkChanged: { title: '链接已更改', message: '此短链接刚刚更新，请重试。' },
  password: {
    title: '受保护的链接',
    heading: '此链接需要密码',
    message: '请输入你收到的密码以继续。',
    label: '密码',
    submit: '继续',
    wrong: '密码不正确。',
    tooMany: '尝试次数过多。请等待几分钟后重试。',
  },
  warning: {
    title: '即将离开',
    eyebrow: '继续前请确认',
    heading: '你即将访问 {host}',
    notice: '此链接将前往外部网站。请仅在信任目标网站时继续。',
    continue: '继续访问',
    cancel: '取消',
  },
  openLink: '打开链接',
};

export const MESSAGES: Record<Locale, Messages> = { en, de, es, fr, it, nl, pl, 'pt-BR': ptBR, ja, 'zh-CN': zhCN };

export function messages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** Map one language tag (lower case) to a supported locale, or null. */
function match(tag: string): Locale | null {
  if (tag === 'zh' || tag.startsWith('zh-cn') || tag.startsWith('zh-sg') || tag.startsWith('zh-hans')) return 'zh-CN';
  if (tag.startsWith('zh-')) return null; // Traditional Chinese is not available; try the next preference.
  const primary = tag.split('-')[0];
  if (primary === 'pt') return 'pt-BR';
  return (LOCALES as readonly string[]).includes(primary) ? (primary as Locale) : null;
}

/** Pick the best supported locale from an Accept-Language header; English if none match. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return 'en';
  const prefs = acceptLanguage
    .slice(0, 512)
    .split(',')
    .slice(0, 20)
    .map((part, i) => {
      const [tag, ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => /^\s*q\s*=\s*([01](?:\.\d{0,3})?)\s*$/.exec(p)).find(Boolean);
      return { tag: tag.trim(), q: q ? Number(q[1]) : 1, i };
    })
    .filter((p) => p.tag && p.tag !== '*' && p.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) {
    const locale = match(p.tag);
    if (locale) return locale;
  }
  return 'en';
}
