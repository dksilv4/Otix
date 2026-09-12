import httpx


def check_search():
    base_url = "http://localhost:8000/api"

    # 1. Search media items
    r = httpx.get(f"{base_url}/media/search?q=movie")
    print("Media search status:", r.status_code)
    print("Media search count:", len(r.json().get("items", [])))

    # 2. Search people & users
    r = httpx.get(f"{base_url}/media/search/grouped?q=Christopher")
    print("Grouped search status:", r.status_code)
    data = r.json()
    print("Grouped search people count:", len(data.get("people", [])))
    print("Grouped search users count:", len(data.get("users", [])))

    # 3. Search companies
    r = httpx.get(f"{base_url}/media/search/companies?q=Warner")
    print("Companies search status:", r.status_code)
    print("Companies search count:", len(r.json().get("items", [])))


if __name__ == "__main__":
    check_search()
