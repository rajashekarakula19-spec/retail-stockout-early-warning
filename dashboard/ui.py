from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st


PALETTE = {
    "ink": "#24333a",
    "muted": "#60717a",
    "line": "#dbe4e8",
    "panel": "#ffffff",
    "soft": "#f5f7f8",
    "teal": "#087f8c",
    "coral": "#d95d39",
    "gold": "#c99700",
    "green": "#2f855a",
    "blue": "#356ac3",
}


def apply_theme() -> None:
    st.markdown(
        """
        <style>
        .stApp {
            background:
                linear-gradient(180deg, #fbfdfc 0%, #edf6f5 330px, #fbfdfc 100%);
            color: #24333a;
        }
        section[data-testid="stSidebar"] {
            background: #f5faf9;
            border-right: 1px solid #dbe4e8;
        }
        section[data-testid="stSidebar"] * {
            color: #24333a;
        }
        .stMarkdown, .stText, p, label, span {
            color: #24333a;
        }
        h1, h2, h3 {
            letter-spacing: 0;
            color: #24333a;
        }
        [data-testid="stMetric"] {
            background: #ffffff;
            border: 1px solid #dbe4e8;
            border-radius: 8px;
            padding: 14px 16px;
            box-shadow: 0 1px 2px rgba(23, 32, 38, 0.05);
        }
        [data-testid="stMetricLabel"] {
            color: #60717a;
        }
        [data-testid="stMetricValue"] {
            color: #24333a;
            font-weight: 720;
        }
        div[data-testid="stVerticalBlock"] > div:has(> div.element-container .section-card) {
            background: #ffffff;
            border: 1px solid #dbe4e8;
            border-radius: 8px;
            padding: 16px 18px;
            box-shadow: 0 1px 2px rgba(23, 32, 38, 0.04);
        }
        .section-card {
            font-size: 0.01rem;
            height: 0;
            margin: 0;
        }
        .hero {
            background:
                radial-gradient(circle at 88% 18%, rgba(217, 93, 57, 0.20), transparent 28%),
                linear-gradient(135deg, #ffffff 0%, #edf8f7 56%, #fff4ef 100%);
            color: #24333a;
            border: 1px solid #cde5e3;
            padding: 26px 30px;
            border-radius: 8px;
            margin-bottom: 18px;
        }
        .hero h1 {
            color: #0f4c5c;
            font-size: 2.15rem;
            margin: 0 0 8px 0;
        }
        .hero p {
            color: #526971;
            font-size: 1.02rem;
            max-width: 860px;
            margin: 0;
        }
        div[data-testid="stDataFrame"] {
            border: 1px solid #dbe4e8;
            border-radius: 8px;
            overflow: hidden;
        }
        button[kind="primary"], button[kind="secondary"] {
            border-radius: 6px;
        }
        .pill {
            display: inline-block;
            background: #e8f4f4;
            color: #0f4c5c;
            border: 1px solid #c9e4e4;
            border-radius: 999px;
            padding: 4px 10px;
            font-size: 0.82rem;
            font-weight: 650;
            margin-right: 6px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def hero(title: str, body: str) -> None:
    st.markdown(f"""<div class="hero"><h1>{title}</h1><p>{body}</p></div>""", unsafe_allow_html=True)


def section(title: str, caption: str | None = None) -> None:
    st.markdown('<div class="section-card"></div>', unsafe_allow_html=True)
    st.subheader(title)
    if caption:
        st.caption(caption)


def bar_chart(
    df: pd.DataFrame,
    x: str,
    y: str,
    color: str = "#087f8c",
    height: int = 320,
    sort: str | list[str] = "-x",
    tooltip: list[str] | None = None,
) -> alt.Chart:
    tooltip = tooltip or list(df.columns)
    return (
        alt.Chart(df)
        .mark_bar(cornerRadiusTopRight=3, cornerRadiusBottomRight=3, color=color)
        .encode(
            x=alt.X(x, title=None),
            y=alt.Y(y, sort=sort, title=None),
            tooltip=tooltip,
        )
        .properties(height=height)
    )


def line_chart(df: pd.DataFrame, x: str, y: str, color: str = "#087f8c", height: int = 300) -> alt.Chart:
    return (
        alt.Chart(df)
        .mark_line(color=color, strokeWidth=2.5)
        .encode(
            x=alt.X(x, title=None),
            y=alt.Y(y, title=None),
            tooltip=list(df.columns),
        )
        .properties(height=height)
    )


def format_feature_name(value: str) -> str:
    return value.replace("num__", "").replace("cat__", "").replace("_", " ").title()
