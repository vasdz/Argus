from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Argus Industrial Eye"
    API_V1_STR: str = "/api/v1"

    # Настройки базы данных (по умолчанию локальные)
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "argus_password"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "argus_db"

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        env_file = ".env"


settings = Settings()
