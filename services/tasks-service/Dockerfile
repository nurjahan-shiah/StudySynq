# Build context is the REPO ROOT (not this directory) so we can bake in
# shared/ alongside this service's own code — Render (and any host without
# docker-compose's bind-mount support) needs everything inside the image.
FROM python:3.11-slim
WORKDIR /app
COPY services/tasks-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY shared /shared
COPY services/tasks-service/main.py .
EXPOSE 8011
CMD ["python", "-u", "main.py"]
