from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def write_csv_from_parquet(input_path: Path, output_path: Path) -> None:
    df = pd.read_parquet(input_path)
    for column in df.select_dtypes(include=["datetime64"]).columns:
        df[column] = df[column].dt.date
    df.to_csv(output_path, index=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export processed model artifacts to CSV for PostgreSQL COPY.")
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    write_csv_from_parquet(PROJECT_ROOT / "data" / "processed" / "modeling_table.parquet", output_dir / "modeling_table.csv")
    write_csv_from_parquet(PROJECT_ROOT / "data" / "processed" / "scored_test_rows.parquet", output_dir / "scored_test_rows.csv")

    confusion = pd.read_csv(PROJECT_ROOT / "reports" / "tables" / "confusion_matrix.csv", index_col=0)
    confusion = confusion.reset_index(names="actual_label")
    confusion.to_csv(output_dir / "confusion_matrix.csv", index=False)


if __name__ == "__main__":
    main()
