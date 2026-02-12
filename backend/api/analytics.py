from fastapi import APIRouter, HTTPException, Body, Depends, Header, Request
from typing import List, Dict, Any, Optional
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.db import trainer_profiles
from core.utils import decode_jwt
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()


def get_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")
    _, _, token = authorization.partition(" ")
    try:
        return decode_jwt(token)
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_admin_or_customer_user(user=Depends(get_user)):
    """Allow both admin and customer access to analytics"""
    role = user.get("role")
    if role not in ["admin", "customer"]:
        raise HTTPException(status_code=403, detail="Admin or Customer access required")
    return user


@router.post("/query")
async def analytics_query(
    request: dict = Body(...),
    user=Depends(get_admin_or_customer_user)
):
    """
    Analytics query endpoint that performs MongoDB aggregation based on fields and filters.
    
    Request body:
    {
        "fields": ["experience", "skill_category"],
        "filters": { "location": "Bangalore" }
    }
    
    Returns:
    {
        "data": [
            { "_id": "Python", "count": 22 },
            { "_id": "React", "count": 15 }
        ]
    }
    """
    try:
        fields = request.get("fields", [])
        filters = request.get("filters", {})

        if not fields or len(fields) == 0:
            raise HTTPException(
                status_code=400, detail="At least one field must be specified"
            )

        # Build match stage for filters
        match_stage = {}
        
        # Location filter
        if filters.get("location"):
            match_stage["location"] = {
                "$regex": filters["location"],
                "$options": "i"
            }
        
        # Experience filter
        if filters.get("experience"):
            exp_filter = filters["experience"]
            if exp_filter == "0-2":
                match_stage["experience_years"] = {"$gte": 0, "$lt": 3}
            elif exp_filter == "3-5":
                match_stage["experience_years"] = {"$gte": 3, "$lt": 6}
            elif exp_filter == "6-10":
                match_stage["experience_years"] = {"$gte": 6, "$lt": 11}
            elif exp_filter == "10+":
                match_stage["experience_years"] = {"$gte": 10}
        
        # Skill category filter
        if filters.get("skill_category"):
            match_stage["skill_domains"] = {
                "$regex": filters["skill_category"],
                "$options": "i"
            }

        # Handle skill_category field - ensure skill_domains exists before match stage
        if "skill_category" in fields:
            # Ensure skill_domains exists and is not empty (only if not already filtered)
            if "skill_domains" not in match_stage:
                
                match_stage["skill_domains"] = {
                    "$exists": True,
                    "$ne": None
                }

        # Build aggregation pipeline
        pipeline = []

        # Match stage
        if match_stage:
            pipeline.append({"$match": match_stage})

        # Unwind arrays if needed
        unwind_stages = []
        
        # Handle skill_category field - unwind after match
        if "skill_category" in fields:
            # Unwind skill_domains array (preserveNullAndEmptyArrays: False will skip empty arrays)
            unwind_stages.append({
                "$unwind": {
                    "path": "$skill_domains",
                    "preserveNullAndEmptyArrays": False
                }
            })

        # Add unwind stages
        pipeline.extend(unwind_stages)

        # Group by the first field
        group_field = fields[0]
        group_id = None

        if group_field == "skill_category":
            group_id = "$skill_domains"
        elif group_field == "experience":
            # Group by experience ranges
            group_id = {
                "$switch": {
                    "branches": [
                        {
                            "case": {"$lt": ["$experience_years", 3]},
                            "then": "0-2 years"
                        },
                        {
                            "case": {"$lt": ["$experience_years", 6]},
                            "then": "3-5 years"
                        },
                        {
                            "case": {"$lt": ["$experience_years", 11]},
                            "then": "6-10 years"
                        },
                        {
                            "case": {"$gte": ["$experience_years", 11]},
                            "then": "10+ years"
                        }
                    ],
                    "default": "Unknown"
                }
            }
        elif group_field == "location":
            group_id = "$location"
        else:
            # Default: try to use the field directly
            group_id = f"${group_field}"

        # Group stage
        pipeline.append({
            "$group": {
                "_id": group_id,
                "count": {"$sum": 1}
            }
        })

        # Sort by count descending
        pipeline.append({"$sort": {"count": -1}})

        # Limit results (optional, to prevent too many results)
        pipeline.append({"$limit": 100})

        logger.info(f"Analytics pipeline: {pipeline}")

        # Execute aggregation
        results = []
        async for doc in trainer_profiles.aggregate(pipeline):
            results.append({
                "_id": doc.get("_id", "Unknown"),
                "count": doc.get("count", 0)
            })

        if len(results) == 0:
            return {
                "data": [],
                "message": "No matching trainers found for the specified filters."
            }

        return {
            "data": results,
            "total": len(results)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analytics query error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing analytics query: {str(e)}"
        )

