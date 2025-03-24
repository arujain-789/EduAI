FROM php:8.2-apache

# Install dependencies
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Copy website files
COPY . /var/www/html/

# Expose port 80
EXPOSE 80

# Start Apache
CMD ["apache2-foreground"]
