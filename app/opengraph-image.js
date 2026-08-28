import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BUILDS } from "@/lib/builds";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Team Rocket — DC DevFest 2026 Buildathon. Six AI builds.";

// Satori has no filesystem access, so the mark is inlined as a data URI.
const logo = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "teamrocketlogo.png")
).toString("base64")}`;

const RED = "#E53238";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0B0D10",
          padding: "68px 72px",
          position: "relative",
        }}
      >
        {/* Ambient glow, tinted to the mark */}
        <div
          style={{
            position: "absolute",
            top: -260,
            right: -180,
            width: 760,
            height: 760,
            borderRadius: 760,
            background: "radial-gradient(circle, rgba(229,50,56,0.30) 0%, rgba(229,50,56,0) 70%)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={82} height={79} alt="" />
          <div
            style={{
              display: "flex",
              fontSize: 25,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#8B95A5",
            }}
          >
            DC DevFest 2026 Buildathon
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: -3.5,
              color: "#FFFFFF",
              lineHeight: 1.02,
            }}
          >
            Six builds, one Team Rocket.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#A3ADBC" }}>
            Every build runs on your own Gemini key.
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {BUILDS.map((b) => (
            <div
              key={b.slug}
              style={{
                display: "flex",
                fontSize: 19,
                color: "#D6DBE3",
                border: "1px solid #2A313B",
                borderRadius: 999,
                padding: "8px 17px",
                background: "#141920",
              }}
            >
              {b.name}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: 8,
            background: RED,
            display: "flex",
          }}
        />
      </div>
    ),
    size
  );
}
