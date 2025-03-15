# install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
uv run fetch_github_content.py

# build
hugo
