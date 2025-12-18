import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Use MapTiler cloud key from env
const API_KEY = import.meta.env.VITE_MAPTILER_KEY;

type MapStop = {
    stop_id: string;
    sequence: number;
    status: "pending" | "in_progress" | "done" | "skipped" | string;
    location?: { lat: number; lon: number } | null;
    on_street_name?: string;
    intersection_loc?: string;
};

interface ULRouteMapProps {
    stops: MapStop[];
    activeStopId?: string | null;
    onSelectStop?: (stopId: string) => void;
    compact?: boolean;
    hidePopups?: boolean;
    fitPadding?: number;
    style?: React.CSSProperties;
}

export function ULRouteMap({
    stops,
    activeStopId,
    onSelectStop,
    compact = false,
    hidePopups = false,
    fitPadding = 50,
    style
}: ULRouteMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markers = useRef<maplibregl.Marker[]>([]);
    const [mapError, setMapError] = useState<string | null>(null);

    // Initial load
    useEffect(() => {
        if (map.current) return; // initialize map only once
        if (!mapContainer.current) return;

        if (!API_KEY) {
            setMapError("Map unavailable (missing tile key).");
            return;
        }

        try {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: `https://api.maptiler.com/maps/streets/style.json?key=${API_KEY}`,
                center: [-98.57, 39.82], // Default center (US)
                zoom: 3,
            });

            map.current.addControl(new maplibregl.NavigationControl(), "top-right");

            if (compact) {
                map.current.scrollZoom.disable();
                map.current.boxZoom.disable();
                map.current.doubleClickZoom.disable();
                map.current.dragRotate.disable();
                map.current.touchZoomRotate.disableRotation();
            }
        } catch (e: any) {
            console.error("Failed to initialize map", e);
            setMapError("Map failed to load.");
        }

        return () => {
            markers.current.forEach(m => m.remove());
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // Update markers and bounds
    useEffect(() => {
        if (!map.current || !API_KEY) return;

        // Clear existing markers
        markers.current.forEach(m => m.remove());
        markers.current = [];

        const bounds = new maplibregl.LngLatBounds();
        let hasValidStops = false;

        stops.forEach((stop) => {
            // Validate location: must exist, not be 0,0, and not be NaN
            if (
                !stop.location ||
                (stop.location.lat === 0 && stop.location.lon === 0) ||
                Number.isNaN(stop.location.lat) ||
                Number.isNaN(stop.location.lon)
            ) {
                return;
            }

            hasValidStops = true;
            const { lat, lon } = stop.location;
            bounds.extend([lon, lat]);

            // Marker styling based on status
            let color = "#a0aec0"; // pending/default (gray)
            if (stop.status === "in_progress") color = "#3182ce"; // blue
            if (stop.status === "done" || stop.status === "completed") color = "#48bb78"; // green
            if (stop.status === "skipped") color = "#ed8936"; // amber

            // Create marker element
            const el = document.createElement("div");
            el.className = "marker";
            el.style.backgroundColor = color;
            el.style.width = stop.stop_id === activeStopId ? "24px" : "20px";
            el.style.height = stop.stop_id === activeStopId ? "24px" : "20px";
            el.style.borderRadius = "50%";
            el.style.border = stop.stop_id === activeStopId ? "3px solid white" : "2px solid white";
            el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
            el.style.display = "flex";
            el.style.alignItems = "center";
            el.style.justifyContent = "center";
            el.style.color = "white";
            el.style.fontSize = "10px";
            el.style.fontWeight = "bold";
            el.style.cursor = "pointer";
            el.innerText = String(stop.sequence);

            // Hover tooltip
            const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setText(
                `#${stop.sequence}: ${stop.on_street_name || stop.stop_id}`
            );

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([lon, lat])
                .setPopup(popup)
                .addTo(map.current!);

            // Click handler (always works)
            el.addEventListener("click", () => {
                if (onSelectStop) onSelectStop(stop.stop_id);
                if (!hidePopups) marker.togglePopup();
            });

            // Hover tooltip (only if device supports hover)
            const canHover = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

            if (canHover && !hidePopups) {
                el.addEventListener("mouseenter", () => marker.togglePopup());
                el.addEventListener("mouseleave", () => marker.togglePopup());
            }

            markers.current.push(marker);
        });

        // Fit bounds if valid stops exist
        if (hasValidStops) {
            map.current.fitBounds(bounds, { padding: fitPadding, maxZoom: 15 });
        }
    }, [stops, activeStopId, compact, hidePopups, fitPadding]);

    if (mapError) {
        return (
            <div style={{
                height: "300px",
                width: "100%",
                background: "#f7fafc",
                border: "1px dashed #cbd5e0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#718096",
                borderRadius: "8px"
            }}>
                {mapError}
            </div>
        );
    }

    return (
        <div
            ref={mapContainer}
            className="map-container"
            style={{
                height: "300px",
                width: "100%",
                borderRadius: "8px",
                overflow: "hidden",
                marginBottom: "1rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                ...style
            }}
        />
    );
}
