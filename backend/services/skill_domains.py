import re
from typing import Iterable, List, Set


CATEGORY_KEYWORDS = {
    "Testing": [
        "testing",
        "tester",
        "qa",
        "quality assurance",
        "manual testing",
        "automation",
        "automation testing",
        "selenium",
        "appium",
        "pytest",
        "jmeter",
        "testng",
        "uat",
        "quality engineer",
    ],
    "Data Engineering": [
        "data engineer",
        "data engineering",
        "etl",
        "elt",
        "data pipeline",
        "apache spark",
        "spark",
        "hadoop",
        "airflow",
        "kafka",
        "databricks",
        "snowflake",
        "big data",
    ],
    "Data Science": [
        "data scientist",
        "data science",
        "machine learning",
        "ml engineer",
        "ai engineer",
        "artificial intelligence",
        "deep learning",
        "nlp",
        "computer vision",
        "tensorflow",
        "pytorch",
    ],
    "Analytics": [
        "analytics",
        "business analyst",
        "data analyst",
        "power bi",
        "tableau",
        "qlik",
        "excel",
        "bi developer",
    ],
    "DevOps": [
        "devops",
        "ci/cd",
        "cicd",
        "jenkins",
        "docker",
        "kubernetes",
        "helm",
        "ansible",
        "terraform",
        "infrastructure as code",
    ],
    "Cloud": [
        "cloud",
        "aws",
        "amazon web services",
        "azure",
        "gcp",
        "google cloud",
        "cloud architect",
        "cloud engineer",
        "cloud practitioner",
    ],
    "Backend": [
        "backend",
        "server-side",
        "python",
        "django",
        "flask",
        "fastapi",
        "java",
        "spring",
        "node.js",
        "nodejs",
        "express",
        "golang",
        "php",
        "laravel",
        "ruby",
        "rails",
        ".net",
        "c#",
    ],
    "Frontend": [
        "frontend",
        "client-side",
        "react",
        "angular",
        "vue",
        "javascript",
        "typescript",
        "html",
        "css",
        "next.js",
        "nextjs",
        "svelte",
    ],
    "Mobile": [
        "mobile",
        "android",
        "ios",
        "react native",
        "flutter",
        "xamarin",
        "kotlin",
        "swift",
    ],
    "Database": [
        "database",
        "sql",
        "mysql",
        "postgres",
        "postgresql",
        "oracle",
        "mongodb",
        "nosql",
        "db2",
        "sql server",
        "pl/sql",
    ],
    "Security": [
        "security",
        "cybersecurity",
        "cyber security",
        "penetration testing",
        "pentest",
        "vulnerability",
        "soc",
        "siem",
        "information security",
    ],
    "Management": [
        "project manager",
        "project management",
        "program manager",
        "product manager",
        "scrum master",
        "pmp",
        "agile",
        "delivery manager",
    ],
    "HR": [
        "hr",
        "human resources",
        "human resource",
        "recruitment",
        "recruiter",
        "talent acquisition",
        "employee relations",
        "payroll",
        "compensation",
        "benefits",
        "hr manager",
        "hr executive",
    ],
    "UI/UX": [
        "ui design",
        "ux design",
        "user experience",
        "user interface",
        "figma",
        "adobe xd",
        "sketch",
        "wireframe",
        "prototype",
    ],
    "ERP": [
        "sap",
        "oracle erp",
        "oracle ebs",
        "erp",
        "sap hana",
        "sap basis",
        "sap fico",
    ],
    "Networking": [
        "network",
        "networking",
        "router",
        "switch",
        "ccna",
        "ccnp",
        "firewall",
        "lan",
        "wan",
    ],
}


def _iter_text_sources(skills: Iterable[str], raw_text: str | None) -> str:
    parts: List[str] = []
    for skill in skills or []:
        if isinstance(skill, str):
            parts.append(skill)
    if raw_text:
        parts.append(raw_text)
    return " ".join(parts).lower()


def infer_skill_domains(skills: Iterable[str] | None, raw_text: str | None = None) -> List[str]:
    """
    Infer high-level skill domains from a list of skills and optional raw resume text.
    Returns a sorted list of unique domain labels (title case).
    """
    text = _iter_text_sources(skills, raw_text)
    if not text.strip():
        return ["Other"]

    domains: Set[str] = set()
    for domain, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            keyword_clean = keyword.lower().strip()
            if not keyword_clean:
                continue
            
            # Use word boundary matching for precise matching
            # This prevents false positives (e.g., "hr" matching "their", "there", "where")
            # For multi-word phrases, match the entire phrase
            if " " in keyword_clean:
                # Multi-word phrase: match as whole phrase with word boundaries
                pattern = rf"\b{re.escape(keyword_clean)}\b"
            else:
                # Single word: use word boundaries to prevent substring matches
                pattern = rf"\b{re.escape(keyword_clean)}\b"
            
            if re.search(pattern, text, re.IGNORECASE):
                domains.add(domain)
                break

    if not domains:
        return ["Other"]

    return sorted(domains)

