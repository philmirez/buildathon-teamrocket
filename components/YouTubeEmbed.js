import s from "./YouTubeEmbed.module.css";

/**
 * A YouTube player in the same 16:9 frame as the local walkthroughs, via the
 * privacy-enhanced host so no cookies land until the visitor presses play.
 */
export default function YouTubeEmbed({ id, title, className }) {
  if (!id) return null;
  return (
    <iframe
      key={id}
      className={`${s.embed} ${className || ""}`}
      src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
      title={title}
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
