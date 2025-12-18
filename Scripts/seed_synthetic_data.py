import random
import datetime
import psycopg2
import logging
from typing import List, Dict, Any, Optional

# --- CONFIG ---------------------------------
SEED = 42
NUM_DAYS = 180
STOPS_PER_RUN = 25  # Target stops per day (approximate)

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "fieldpro_db",
    "user": "fieldpro",
    "password": "fieldpro_pass",
}

POOL_ID = "NW_D"
BASE_ID = "NORTH"
USER_ID = 123  # Ensure this user exists

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def log(msg):
    logging.info(msg)

# --- CLASSES & HELPERS ----------------------

class StopState:
    def __init__(self, stop_id: str, is_hotspot: bool):
        self.stop_id = stop_id
        self.is_hotspot = is_hotspot
        self.priority_class = "medium"  # default
        
        # State tracking
        self.current_volume = 0.0
        self.last_l3_date: Optional[datetime.date] = None
        
        # Propensities (static for the simulation)
        self.hazard_propensity = random.random()  # 0.0 to 1.0
        self.infra_propensity = random.random()   # 0.0 to 1.0
        
        # Consistent hazard/infra types for this stop
        self.favored_hazard = random.choice(["BIOHAZARD", "NEEDLE", "GLASS"])
        self.favored_infra = random.choice(["BROKEN_GLASS", "GRAFFITI", "STRUCTURAL"])

    def get_fill_rate(self) -> float:
        if self.priority_class == "light":
            return 0.3  # fills in ~13 days
        elif self.priority_class == "hotspot":
            return 1.2  # fills in ~3-4 days
        return 0.5      # medium: fills in ~8 days

    def accumulate_trash(self):
        self.current_volume += self.get_fill_rate()
        if self.current_volume > 4.0:
            self.current_volume = 4.0

    def reset_trash(self):
        self.current_volume = 0.0

def compute_duration(
    base_minutes: int,
    emptied_trash: bool,
    washed_pad: bool,
    washed_shelter: bool,
    compactor: bool,
    volume: int,
    has_hazard: bool,
    is_l3: bool,
    priority_class: str
) -> int:
    """
    Compute duration based on work performed.
    """
    duration = base_minutes
    
    if emptied_trash:
        duration += random.randint(2, 6)
    if washed_pad:
        duration += random.randint(6, 12)
    if washed_shelter: # Assume wash shelter happens rarely but takes time
        duration += random.randint(3, 8)
    if compactor:
        duration += random.randint(3, 10)
    
    # Volume tax
    if volume >= 3:
        duration += random.randint(3, 8)
        
    if has_hazard:
        duration += random.randint(4, 12)
        
    if is_l3:
        duration += random.randint(8, 18)
        
    # Clamp based on priority class expectations
    if priority_class == "light":
        return max(8, min(duration, 18))
    elif priority_class == "hotspot":
        return max(18, min(duration, 35))
    else: # medium
        return max(12, min(duration, 24))

# --- MAIN -----------------------------------

def main():
    random.seed(SEED)
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    
    try:
        cur = conn.cursor()
        
        # 0) Fetch candidate stops
        log(f"Fetching stops for pool {POOL_ID}...")
        cur.execute("""
            SELECT "STOP_ID", COALESCE(is_hotspot, false)
            FROM public.stops
            WHERE pool_id = %s
        """, (POOL_ID,))
        rows = cur.fetchall()
        
        if not rows:
            raise RuntimeError(f"No stops found for pool_id={POOL_ID}")
            
        stops: Dict[str, StopState] = {}
        stop_ids = []
        
        # 1) Assign Priority Class & Initialize State
        non_hotspots = []
        
        for r in rows:
            s_id, is_h = r[0], r[1]
            s = StopState(s_id, is_h)
            
            if is_h:
                s.priority_class = "hotspot"
            else:
                non_hotspots.append(s)
            
            stops[s_id] = s
            stop_ids.append(s_id)
            
        # Randomly assign 15% of non-hotspots to 'light'
        num_light = int(len(non_hotspots) * 0.15)
        light_stops = random.sample(non_hotspots, num_light)
        for s in light_stops:
            s.priority_class = "light"
        # The rest remain 'medium' (default)

        # Update stops in DB
        log("Updating stop priority_classes in DB...")
        for s in stops.values():
            cur.execute("""
                UPDATE public.stops
                SET priority_class = %s
                WHERE "STOP_ID" = %s
            """, (s.priority_class, s.stop_id))
        
        # 2) Simulation Loop
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=NUM_DAYS)
        
        log(f"Starting simulation from {start_date} to {today} ({NUM_DAYS} days)")
        
        for day_i in range(NUM_DAYS):
            curr_date = start_date + datetime.timedelta(days=day_i)
            
            # --- Daily State Updates (Accumulate Trash) ---
            for s in stops.values():
                s.accumulate_trash()
                
            # --- Plan Route ---
            # Randomly select stops
            # We want ~STOPS_PER_RUN stops.
            # Logic: prioritize hotspots or full cans?
            # Creating a simple selection mix for now as per requirements
            daily_stops = random.sample(stop_ids, min(len(stop_ids), STOPS_PER_RUN))
            
            # Shift Window
            # Start 6:30 - 8:30
            start_hour = random.randint(6, 8)
            start_minute = random.randint(0, 59)
            if start_hour == 8 and start_minute > 30:
                start_minute = 30
            elif start_hour == 6 and start_minute < 30:
                start_minute = 30
                
            shift_start = datetime.datetime.combine(curr_date, datetime.time(start_hour, start_minute))
            
            # Insert Route Run
            cur.execute("""
                INSERT INTO public.route_runs (user_id, route_pool_id, base_id, run_date, status)
                VALUES (%s, %s, %s, %s, 'done')
                RETURNING id
            """, (USER_ID, POOL_ID, BASE_ID, curr_date))
            route_run_id = cur.fetchone()[0]
            
            # Process Stops
            curr_time = shift_start
            
            total_minutes = 0
            total_hotspots = 0
            
            # 85% planned, 10% emergency, 5% ad-hoc
            # We'll assign origin_type as we iterate
            
            for seq, s_id in enumerate(daily_stops, start=1):
                stop_obj = stops[s_id]
                
                # Determine origin_type
                r_orig = random.random()
                if r_orig < 0.85:
                    origin_type = 'planned'
                elif r_orig < 0.95:
                    origin_type = 'emergency'
                else:
                    origin_type = 'ul_ad_hoc'
                    
                # Travel time
                travel_gap = random.randint(2, 12)
                curr_time += datetime.timedelta(minutes=travel_gap)
                
                # Prepare work details
                cleaned_at = curr_time
                
                # Deterministic logic for 'work done' based on stop state
                # If volume > 0, we empty trash.
                # If priority is hotspot, always washed_pad?
                
                vol_int = int(stop_obj.current_volume)
                has_trash = vol_int > 0
                
                picked_up_litter = True
                emptied_trash = has_trash
                
                # Randomized wash logic
                washed_shelter = (random.random() < 0.1)
                washed_pad = (stop_obj.priority_class == 'hotspot' and random.random() < 0.8) or (random.random() < 0.2)
                washed_can = (random.random() < 0.3)
                
                # L3 Logic
                # Check days since last L3
                days_since_l3 = 999
                if stop_obj.last_l3_date:
                    days_since_l3 = (curr_date - stop_obj.last_l3_date).days
                
                l3_prob = 0.05
                if days_since_l3 >= 30:
                    l3_prob = 0.2
                if stop_obj.priority_class == 'hotspot':
                    l3_prob += 0.1
                    
                is_l3 = (random.random() < l3_prob)
                level = 3 if is_l3 else (2 if vol_int >= 3 else 1)
                
                # Hazard Logic
                # Propensity based
                has_hazard = (random.random() < (stop_obj.hazard_propensity * 0.3)) # Max 30% chance for high propensity
                if stop_obj.priority_class == 'hotspot':
                    has_hazard = has_hazard or (random.random() < 0.3)
                    
                # Infra Logic
                has_infra = (random.random() < (stop_obj.infra_propensity * 0.15))
                
                # Compute Duration
                duration_mins = compute_duration(
                    base_minutes=random.randint(6, 12),
                    emptied_trash=emptied_trash,
                    washed_pad=washed_pad,
                    washed_shelter=washed_shelter,
                    compactor=False, # simplfication
                    volume=vol_int,
                    has_hazard=has_hazard,
                    is_l3=is_l3,
                    priority_class=stop_obj.priority_class
                )
                
                # Execute Work (advance time)
                curr_time += datetime.timedelta(minutes=duration_mins)
                total_minutes += duration_mins
                
                # Update State
                if emptied_trash:
                    stop_obj.reset_trash()
                if is_l3:
                    stop_obj.last_l3_date = curr_date

                # DB Inserts
                
                # route_run_stops
                cur.execute("""
                    INSERT INTO public.route_run_stops (
                        route_run_id, stop_id, sequence,
                        planned_distance_m, planned_duration_s,
                        status, completed_at, origin_type
                    )
                    VALUES (%s, %s, %s, %s, %s, 'done', %s, %s)
                    RETURNING id
                """, (
                    route_run_id, s_id, seq,
                    random.uniform(100, 2000), # distance
                    random.uniform(120, 600),  # planned duration (OSRM)
                    cleaned_at, origin_type
                ))
                rrs_id = cur.fetchone()[0]
                
                # clean_logs
                cur.execute("""
                    INSERT INTO public.clean_logs (
                        route_run_stop_id, stop_id, user_id, cleaned_at,
                        duration_minutes,
                        picked_up_litter, emptied_trash,
                        washed_shelter, washed_pad, washed_can,
                        level, notes
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    rrs_id, s_id, USER_ID, cleaned_at,
                    duration_mins,
                    picked_up_litter, emptied_trash,
                    washed_shelter, washed_pad, washed_can,
                    level, "[SYNTHETIC]"
                ))
                
                # trash_volume_logs
                # logged slightly before cleaning
                log_time = cleaned_at - datetime.timedelta(minutes=random.randint(0, 5))
                cur.execute("""
                    INSERT INTO public.trash_volume_logs (
                        route_run_stop_id, stop_id, logged_at, volume, notes
                    )
                    VALUES (%s, %s, %s, %s, %s)
                """, (rrs_id, s_id, log_time, vol_int, "[SYNTHETIC]"))
                
                # hazards
                hazard_id = None
                if has_hazard:
                    total_hotspots += 1
                    report_time = cleaned_at + datetime.timedelta(minutes=random.randint(0, 30))
                    cur.execute("""
                        INSERT INTO public.hazards (
                            stop_id, route_run_stop_id,
                            reported_at, reported_by,
                            hazard_type, severity, notes, details
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, '{}'::jsonb)
                        RETURNING id
                    """, (
                        s_id, rrs_id, report_time, USER_ID,
                        stop_obj.favored_hazard, random.randint(1, 3), "[SYNTHETIC]"
                    ))
                    hazard_id = cur.fetchone()[0]
                    
                    # Backlink
                    cur.execute("""
                        UPDATE public.route_run_stops SET hazard_id = %s WHERE id = %s
                    """, (hazard_id, rrs_id))
                    
                # infra
                infra_id = None
                if has_infra:
                    report_time = cleaned_at + datetime.timedelta(minutes=random.randint(0, 30))
                    cur.execute("""
                        INSERT INTO public.infrastructure_issues (
                            stop_id, route_run_stop_id,
                            reported_at, reported_by,
                            issue_type, severity, notes,
                            component, cause, needs_facilities, details
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '{}'::jsonb)
                        RETURNING id
                    """, (
                        s_id, rrs_id, report_time, USER_ID,
                        stop_obj.favored_infra, random.randint(1, 3), "[SYNTHETIC]",
                        "SHELTER", "WEAR_AND_TEAR", False
                    ))
                    infra_id = cur.fetchone()[0]
                    
                    # Backlink
                    cur.execute("""
                        UPDATE public.route_run_stops SET infra_issue_id = %s WHERE id = %s
                    """, (infra_id, rrs_id))
                    
                # level3_logs
                if is_l3:
                    cur.execute("""
                        INSERT INTO public.level3_logs (
                            route_run_stop_id, stop_id,
                            cleaned_at, user_id, level, notes
                        )
                        VALUES (%s, %s, %s, %s, 3, %s)
                    """, (rrs_id, s_id, cleaned_at, USER_ID, "[SYNTHETIC]"))
            
            # End of Route Run - Metrics
            try:
                difficulty_score = round(0.5 * total_hotspots + 0.01 * total_minutes, 2)
                cur.execute("""
                    INSERT INTO public.workforce_metrics (
                        route_run_id, user_id, run_date,
                        total_stops, total_minutes,
                        total_hotspots, total_compactors,
                        difficulty_score
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    route_run_id, USER_ID, curr_date,
                    len(daily_stops), total_minutes,
                    total_hotspots, 0,
                    difficulty_score
                ))
            except psycopg2.errors.UndefinedTable:
                pass # skip if missing
                
            # Commit Daily
            conn.commit()
            if day_i % 10 == 0:
                log(f"Committed day {day_i+1}/{NUM_DAYS} ({curr_date})")
                
        log("Simulation complete.")

    except Exception as e:
        conn.rollback()
        log(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    main()