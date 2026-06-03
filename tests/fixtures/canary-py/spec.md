# DataPulse — Analytics Pipeline

## Problem

Teams running ML experiments have no consistent way to log metrics, compare runs,
or reproduce past experiments. Each engineer keeps their own ad-hoc logging.

## Users

- **ML engineer**: logs metrics during training, queries past runs
- **Data scientist**: compares experiment results, exports data for reporting

## Goals

- Log experiment metrics (loss, accuracy, custom scalars) via a Python API
- Query and compare runs by tag, date range, and metric threshold
- Experiments are versioned; each run is immutable once completed
- CLI for quick exploration; Python SDK for programmatic access

## Components

- **Run service**: creates and finalizes experiment runs
- **Metric store**: time-series storage for scalar metrics per run
- **Query engine**: filtering and aggregation across runs
- **CLI**: `datapulse run list`, `datapulse run show <id>`, `datapulse log`
- **REST API**: thin FastAPI layer over the services

## External Systems

- SQLite (development) / PostgreSQL (production) via SQLAlchemy
- Optional: S3 for artifact storage

## Non-Functional Requirements

- Logging 1,000 metrics/second per run without blocking training
- pytest coverage ≥ 80% on service layer
- CLI response < 500ms for list operations
