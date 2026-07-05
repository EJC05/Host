// Turns a pasted video URL into an embeddable iframe URL.
// Supports YouTube (watch, youtu.be, shorts) and Vimeo; anything else
// renders as a plain link.
export function getEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = parsed.searchParams.get("v");
    if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
    const shorts = parsed.pathname.match(/^\/shorts\/([\w-]+)/);
    if (shorts) return `https://www.youtube-nocookie.com/embed/${shorts[1]}`;
    const embed = parsed.pathname.match(/^\/embed\/([\w-]+)/);
    if (embed) return `https://www.youtube-nocookie.com/embed/${embed[1]}`;
    return null;
  }

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }

  if (host === "vimeo.com") {
    const id = parsed.pathname.match(/^\/(\d+)/);
    return id ? `https://player.vimeo.com/video/${id[1]}` : null;
  }

  if (host === "player.vimeo.com") {
    return url;
  }

  return null;
}
